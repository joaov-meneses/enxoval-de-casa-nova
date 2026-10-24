import {
  Microwave,
  Coffee,
  BedSingle,
  BedDouble,
  Bath,
  Sofa,
  WashingMachine,
  Monitor,
  TreePalm,
  Package,
} from "./icons";

export function RoomIcon({ name, size = 18 }: { name: string; size?: number }) {
  // "Eletro" antes de "cozinha": "Eletro Cozinha" ganha o micro-ondas, não a xícara da Cozinha.
  const Icon = /eletro/i.test(name)
    ? Microwave
    : /cozinha/i.test(name)
      ? Coffee
      : /h[óo]spede|visita/i.test(name)
        ? BedSingle
        : /quarto/i.test(name)
          ? BedDouble
          : /banheiro|lavabo/i.test(name)
            ? Bath
            : /sala/i.test(name)
              ? Sofa
              : /servi[çc]o|lavanderia/i.test(name)
                ? WashingMachine
                : /eletro/i.test(name)
                  ? Microwave
                  : /home\s*office|escrit[óo]rio/i.test(name)
                    ? Monitor
                    : /varanda|sacada|quintal|jardim/i.test(name)
                      ? TreePalm
                      : Package;
  return <Icon size={size} strokeWidth={1.6} />;
}
