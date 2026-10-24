// "Meu Lar" depois das compras (Fase 11.3 e 11.4): quem deu cada presente e os documentos da casa (notas, garantias,
// manuais), com filtro por ambiente e download em ZIP.
import { useEffect, useMemo, useState } from "react";
import { Download, Gift, LoaderCircle, Receipt, ShieldCheck } from "@/src/components/icons";
import { Button } from "@/src/components/ui/button";
import { enxovalDocumentsZipUrl, fetchEnxovalDocuments } from "../api";
import { capture } from "../analytics";
import { itemPriceCents, sumReceived } from "../itemStatus";
import { needsThanks, warrantyDaysLeft } from "../listInsights";
import type { EnxovalCategory, EnxovalItem, ItemDocument } from "../types";
import { DOCUMENT_KIND_LABEL } from "./ItemExtras";
import { Select } from "./Select";
import "./homeRecords.css";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brDate = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

/** CSV dos presentes: item, ambiente, de quem, recado, valor e quando o agradecimento foi marcado. */
export function giftsCsv(items: EnxovalItem[]) {
  const cell = (value: string) => `"${(/^[\s]*[=+@-]/.test(value) ? "'" : "") + value.replace(/"/g, '""')}"`;
  const rows = [
    ["Item", "Ambiente", "De quem", "Recado", "Valor (R$)", "Agradecido em"],
    ...items.map((item) => [
      item.name,
      item.category,
      item.giftFrom ?? "",
      item.giftMessage ?? "",
      itemPriceCents(item) > 0 ? (itemPriceCents(item) / 100).toFixed(2).replace(".", ",") : "",
      item.thankedAt ? brDate(item.thankedAt) : "",
    ]),
  ];
  return "﻿" + rows.map((row) => row.map(cell).join(";")).join("\r\n");
}

export function GiftsPanel({ items, enxovalName }: { items: EnxovalItem[]; enxovalName: string }) {
  const gifts = items.filter((item) => item.status === "received");
  if (gifts.length === 0) return null;
  const pending = gifts.filter(needsThanks).length;
  const download = () => {
    const blob = new Blob([giftsCsv(gifts)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `presentes-${enxovalName.replace(/[^\p{L}\p{N}\s-]/gu, "").trim().replace(/\s+/g, "-") || "enxoval"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    capture("items_exported", { format: "gifts_csv", count: gifts.length });
  };
  return (
    <section className="home-records" aria-labelledby="gifts-title">
      <div className="home-records-head">
        <h3 id="gifts-title">
          <Gift size={18} aria-hidden="true" /> Presentes
        </h3>
        <Button variant="brand" size="brand" type="button" className="button button-outline button-small" onClick={download}>
          <Download size={15} aria-hidden="true" /> Exportar CSV
        </Button>
      </div>
      <p className="home-records-summary">
        {gifts.length} {gifts.length === 1 ? "presente" : "presentes"} · {money.format(sumReceived(gifts) / 100)} em valor
        {pending > 0 && <> · <strong>{pending} a agradecer</strong></>}
      </p>
      <ul className="home-records-list">
        {gifts.map((item) => (
          <li key={item.id}>
            <span className="home-records-name">
              <strong>{item.name}</strong>
              <small>{item.giftFrom ? `de ${item.giftFrom}` : "Sem o nome de quem deu"} · {item.category}</small>
              {item.giftMessage && <q>{item.giftMessage}</q>}
            </span>
            <span className={`home-records-status${item.thankedAt ? " is-done" : ""}`}>
              {item.thankedAt ? `Agradecido em ${brDate(item.thankedAt)}` : "A agradecer"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function HouseDocumentsPanel({
  enxovalId,
  items,
  categories,
}: {
  enxovalId: string;
  items: EnxovalItem[];
  categories: EnxovalCategory[];
}) {
  const withDocuments = items.some((item) => (item.documentCount ?? 0) > 0);
  const documentsKey = items.map((item) => `${item.id}:${item.documentCount ?? 0}`).join(",");
  const [documents, setDocuments] = useState<ItemDocument[] | null>(null);
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!withDocuments) return;
    let alive = true;
    fetchEnxovalDocuments(enxovalId)
      .then((result) => {
        if (!alive) return;
        setDocuments(result.documents);
        setUsage({ used: result.usedBytes, quota: result.quotaBytes });
      })
      .catch((err) => alive && setError(err instanceof Error ? err.message : "Não foi possível carregar os documentos."));
    return () => {
      alive = false;
    };
  }, [enxovalId, withDocuments, documentsKey]);

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const warranties = items
    .filter((item) => item.warrantyUntil && item.status !== "researching")
    .map((item) => ({ item, days: warrantyDaysLeft(item)! }))
    .filter(({ days }) => days >= 0)
    .sort((a, b) => a.days - b.days)
    .slice(0, 5);
  if (!withDocuments && warranties.length === 0) return null;
  const visible = (documents ?? []).filter((document) => !categoryId || itemById.get(document.itemId)?.categoryId === categoryId);
  const roomsWithDocuments = categories.filter((category) =>
    (documents ?? []).some((document) => itemById.get(document.itemId)?.categoryId === category.id),
  );

  return (
    <section className="home-records" aria-labelledby="house-docs-title">
      <div className="home-records-head">
        <h3 id="house-docs-title">
          <Receipt size={18} aria-hidden="true" /> Documentos da casa
        </h3>
        {visible.length > 0 && (
          <a className="button button-outline button-small" href={enxovalDocumentsZipUrl(enxovalId, categoryId || undefined)} download>
            <Download size={15} aria-hidden="true" /> Baixar ZIP
          </a>
        )}
      </div>
      {warranties.length > 0 && (
        <ul className="home-records-warranties" aria-label="Próximas garantias a vencer">
          {warranties.map(({ item, days }) => (
            <li key={item.id} className={days <= 30 ? "is-soon" : undefined}>
              <ShieldCheck size={14} aria-hidden="true" />
              <span>
                <strong>{item.name}</strong>: garantia até {brDate(item.warrantyUntil!)}
                {days <= 30 && <> ({days === 0 ? "vence hoje" : `faltam ${days} ${days === 1 ? "dia" : "dias"}`})</>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {withDocuments && (
        <>
          {roomsWithDocuments.length > 1 && (
            <Select
              id="house-docs-room"
              ariaLabel="Filtrar documentos por ambiente"
              value={categoryId}
              onChange={setCategoryId}
              options={[{ value: "", label: "Todos os ambientes" }, ...roomsWithDocuments.map((category) => ({ value: category.id, label: category.name }))]}
            />
          )}
          {documents === null && !error ? (
            <p className="home-records-summary" role="status">
              <LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> Carregando documentos…
            </p>
          ) : (
            <ul className="home-records-list">
              {visible.map((document) => {
                const item = itemById.get(document.itemId);
                return (
                  <li key={document.id}>
                    <span className="home-records-name">
                      <a href={document.url} target="_blank" rel="noopener noreferrer">
                        <strong>{document.fileName}</strong>
                      </a>
                      <small>
                        {DOCUMENT_KIND_LABEL[document.kind]} · {item?.name ?? "Item"} · {item?.category ?? ""}
                      </small>
                    </span>
                    <span className="home-records-status">{brDate(document.createdAt)}</span>
                  </li>
                );
              })}
            </ul>
          )}
          {usage && (
            <p className="home-records-summary">
              Espaço usado: {(usage.used / 1024 / 1024).toFixed(1).replace(".", ",")} MB de {Math.round(usage.quota / 1024 / 1024)} MB
            </p>
          )}
        </>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  );
}
