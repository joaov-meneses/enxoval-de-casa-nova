// ZIP mínimo, sem compressão (PDFs e fotos já vêm comprimidos), escrito em fluxo: um arquivo por vez na memória.
import type { Writable } from 'node:stream';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((Math.max(date.getFullYear(), 1980) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

/** Nomes únicos e seguros dentro do ZIP ("a/b.pdf", "a/b (2).pdf"). */
export function uniqueZipName(taken: Set<string>, wanted: string) {
  const clean = wanted
    .split('/')
    .map(part => part.replace(/[\u0000-\u001f\u007f\\:*?"<>|]/g, '').replace(/^\.+/, '').trim().slice(0, 120) || 'arquivo')
    .join('/');
  const dot = clean.lastIndexOf('.');
  const [base, ext] = dot > clean.lastIndexOf('/') + 1 ? [clean.slice(0, dot), clean.slice(dot)] : [clean, ''];
  let name = clean;
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base} (${n})${ext}`;
  taken.add(name.toLowerCase());
  return name;
}

export class ZipWriter {
  private offset = 0;
  private entries: { name: Buffer; crc: number; size: number; offset: number; time: number; day: number }[] = [];

  constructor(private readonly out: Writable) {}

  private async write(chunk: Buffer) {
    this.offset += chunk.length;
    if (!this.out.write(chunk)) await new Promise<void>(resolve => this.out.once('drain', () => resolve()));
  }

  async add(name: string, data: Buffer, modified = new Date()) {
    const nameBytes = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const { time, day } = dosDateTime(modified);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6); // nomes em UTF-8
    header.writeUInt16LE(0, 8); // sem compressão
    header.writeUInt16LE(time, 10);
    header.writeUInt16LE(day, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    header.writeUInt16LE(0, 28);
    this.entries.push({ name: nameBytes, crc, size: data.length, offset: this.offset, time, day });
    await this.write(Buffer.concat([header, nameBytes]));
    await this.write(data);
  }

  async finish() {
    const start = this.offset;
    for (const entry of this.entries) {
      const header = Buffer.alloc(46);
      header.writeUInt32LE(0x02014b50, 0);
      header.writeUInt16LE(20, 4);
      header.writeUInt16LE(20, 6);
      header.writeUInt16LE(0x0800, 8);
      header.writeUInt16LE(0, 10);
      header.writeUInt16LE(entry.time, 12);
      header.writeUInt16LE(entry.day, 14);
      header.writeUInt32LE(entry.crc, 16);
      header.writeUInt32LE(entry.size, 20);
      header.writeUInt32LE(entry.size, 24);
      header.writeUInt16LE(entry.name.length, 28);
      header.writeUInt32LE(entry.offset, 42);
      await this.write(Buffer.concat([header, entry.name]));
    }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(this.entries.length, 8);
    end.writeUInt16LE(this.entries.length, 10);
    end.writeUInt32LE(this.offset - start, 12);
    end.writeUInt32LE(start, 16);
    await this.write(end);
    this.out.end();
  }
}
