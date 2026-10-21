import { useEffect } from "react";
import { ArrowLeft } from "@/src/components/icons";
import { Brand } from "./Brand";

const SECTIONS = [
  {
    title: "O que o Nino olha",
    body: "A casa que você descreveu: tipo de moradia, ambientes, quantas pessoas moram nela, o estado, o perfil de gasto e o prazo da mudança. Também olha o que já está na sua lista.",
  },
  {
    title: "O que ele sugere",
    body: "O próximo item de um ambiente, o que vale comprar primeiro e, ao adicionar um item, o cômodo mais provável e um aviso quando algo pode estar repetido. Os itens do Primeiro Dia vêm antes da decoração.",
  },
  {
    title: "Quem decide",
    body: "Você. O Nino só sugere: nada entra, sai ou é comprado sem a sua escolha, e você pode ignorar qualquer sugestão.",
  },
  {
    title: "De onde vêm as sugestões",
    body: "De um catálogo de itens do próprio Casa Mia. Quando a ajuda do Nino está ativa, uma parte do cálculo usa o modelo Jev, da TypeSafe AI, que responde a perguntas objetivas sobre a sua lista. Os dados enviados estão descritos na política de privacidade.",
  },
  {
    title: "O que ele não faz",
    body: "Não tenta aumentar o quanto você gasta, não cria urgência artificial e não mostra anúncios. A ideia é você gastar o necessário para morar bem.",
  },
];

export function NinoMethodPage() {
  useEffect(() => {
    document.title = "Como o Nino escolhe | Casa Mia";
  }, []);
  return (
    <main className="privacy-page">
      <header className="privacy-top">
        <a href="/" className="brand-link">
          <Brand />
        </a>
        <a href="/" className="privacy-back">
          <ArrowLeft size={16} /> Voltar ao início
        </a>
      </header>
      <article className="privacy-body">
        <span className="eyebrow">TRANSPARÊNCIA</span>
        <h1>Como o Nino escolhe</h1>
        <p className="privacy-updated">
          As sugestões são do Nino; as escolhas são suas.
        </p>
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            <p>{section.body}</p>
          </section>
        ))}
        <section>
          <p>
            Quer saber mais sobre os seus dados? Leia a{" "}
            <a href="/privacidade">política de privacidade</a>.
          </p>
        </section>
      </article>
    </main>
  );
}
