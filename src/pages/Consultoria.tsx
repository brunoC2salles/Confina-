// src/pages/Consultoria.tsx
import { MouseEvent } from 'react'
import './consultoria.css'

const WHATSAPP_NUMERO = '5555999275622'

function linkWhatsApp(mensagem: string): string {
  return `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(mensagem)}`
}

function scrollParaProdutos(e: MouseEvent<HTMLAnchorElement>) {
  e.preventDefault()
  document.getElementById('produtos')?.scrollIntoView({ behavior: 'smooth' })
}

const MSG_PRODUTO_1 = 'Olá Ricardo, quero saber mais da consultoria Confina+! Vim em busca do produto Planejamento básico e plano de ação!'
const MSG_PRODUTO_2 = 'Olá Ricardo, quero saber mais da consultoria Confina+! Vim em busca do produto Planejamento e acompanhamento anual!'
const MSG_PRODUTO_3 = 'Olá Ricardo, quero saber mais da consultoria Confina+! Vim em busca do produto Visita técnica!'
const MSG_PRODUTO_4 = 'Olá Ricardo, quero saber mais da consultoria Confina+! Vim em busca do produto Dia de campo na propriedade modelo! Gostaria de entrar na lista de espera da Imersão Confina+ 2027.'
const MSG_GERAL = 'Olá Ricardo, quero saber mais da consultoria Confina+!'
const MSG_PARCERIA = 'Olá Ricardo, quero saber mais sobre parcerias com o Confina+! Represento uma marca ou fornecedor e gostaria de fazer parte do ecossistema Confina+.'

export default function Consultoria() {
  return (
    <div className="cons-page">
      {/* HERO */}
      <section className="cons-hero">
        <img src="/hero-consultoria.png" alt="Rebanho Angus Confina+" className="cons-hero-img" />
        <img src="/logo.png" alt="Confina+" className="cons-hero-logo" />
        <div className="cons-hero-overlay">
          <h1>
            Levar mais resultados ao seu manejo
            <br />
            é a nossa missão
          </h1>
        </div>
        <div className="cons-hero-scrim" />
        <div className="cons-hero-cta-bottom">
          <a className="cons-btn cons-btn-primary" href={linkWhatsApp(MSG_GERAL)} target="_blank" rel="noreferrer">
            Falar com um especialista
          </a>
          <a className="cons-btn cons-btn-secundario" href="#produtos" onClick={scrollParaProdutos}>
            Saber mais
          </a>
        </div>
      </section>

      {/* PRODUTOS 1, 2, 3 */}
      <section className="cons-produtos" id="produtos">
        <h2 className="cons-section-title">Consultoria Confina+</h2>

        <div className="cons-grid">
          {/* Produto 1 */}
          <div className="cons-card">
            <span className="cons-card-tag">Produto 1</span>
            <h3>Planejamento básico e plano de ação</h3>
            <ul className="cons-lista">
              <li>Planejamento de implementação de um confinamento desde o zero, com base na Calculadora de Confinamento</li>
              <li>Planilha de custos e indicação de fornecedores</li>
              <li>1 reunião de reconhecimento</li>
              <li>Plano completo de ação para os próximos 12 meses</li>
              <li>1 reunião de dúvidas</li>
            </ul>

            <table className="cons-precos">
              <tbody>
                <tr><td>0 a 350 animais</td><td>R$ 18.000</td></tr>
                <tr><td>350 a 700 animais</td><td>R$ 28.000</td></tr>
                <tr><td>700+ animais</td><td>R$ 42.000</td></tr>
              </tbody>
            </table>

            <a className="cons-btn cons-btn-primary" href={linkWhatsApp(MSG_PRODUTO_1)} target="_blank" rel="noreferrer">
              Quero esse plano
            </a>
          </div>

          {/* Produto 2 */}
          <div className="cons-card cons-card-destaque">
            <span className="cons-card-tag cons-card-tag-gold">Produto 2</span>
            <h3>Planejamento e acompanhamento anual</h3>
            <ul className="cons-lista">
              <li>Tudo do Produto 1</li>
              <li>1 visita técnica na propriedade</li>
              <li>Suporte do analista de dados na implementação</li>
              <li>1 reunião mensal com o analista de dados</li>
              <li>2 reuniões online por mês para revisão de processo e análise de dados</li>
              <li>Projeto dos cochos</li>
              <li>Relatos de carregamentos</li>
              <li>Acesso à comunidade de produtores e fornecedores</li>
              <li>Acesso gratuito à plataforma Confina+ por 1 ano</li>
              <li>Vídeos tutoriais</li>
            </ul>

            <table className="cons-precos">
              <tbody>
                <tr><td>0 a 350 animais</td><td>R$ 6.000/mês</td></tr>
                <tr><td>350 a 700 animais</td><td>R$ 8.000/mês</td></tr>
                <tr><td>700+ animais</td><td>R$ 11.000/mês</td></tr>
              </tbody>
            </table>
            <p className="cons-nota">Contrato de 12 meses</p>

            <a className="cons-btn cons-btn-primary" href={linkWhatsApp(MSG_PRODUTO_2)} target="_blank" rel="noreferrer">
              Quero esse plano
            </a>
          </div>

          {/* Produto 3 */}
          <div className="cons-card">
            <span className="cons-card-tag">Produto 3</span>
            <h3>Visita técnica</h3>
            <ul className="cons-lista">
              <li>Visita do especialista à propriedade do cliente para análise geral de parâmetros</li>
              <li>Geração de relatório de análise</li>
              <li>Duração: 2 turnos (dia a combinar)</li>
            </ul>

            <table className="cons-precos">
              <tbody>
                <tr><td>0 a 350 animais</td><td>R$ 6.000</td></tr>
                <tr><td>350 a 700 animais</td><td>R$ 8.000</td></tr>
                <tr><td>700+ animais</td><td>R$ 11.000</td></tr>
              </tbody>
            </table>

            <a className="cons-btn cons-btn-primary" href={linkWhatsApp(MSG_PRODUTO_3)} target="_blank" rel="noreferrer">
              Quero essa visita
            </a>
          </div>
        </div>

        <div className="cons-observacoes">
          <p>Produto 1 é parcelável em até 6x sem juros.</p>
          <p>15% de desconto na Consultoria de Implementação (Produto 2) para quem já contratou o Produto 1.</p>
          <p>Todos os produtos estão sujeitos a lista de espera conforme o período do ano.</p>
        </div>
      </section>

      {/* PRODUTO 4 */}
      <section className="cons-produto4-wrap">
        <div className="cons-card cons-card-destaque cons-card-produto4">
          <span className="cons-card-tag cons-card-tag-gold">Produto 4</span>
          <h3>Dia de campo na propriedade modelo</h3>
          <p className="cons-produto4-local">Fazenda Dona Lucy, São Gabriel (RS)</p>

          <ul className="cons-lista">
            <li>Análise completa de rotina e operação</li>
            <li>Acesso aos demais produtores e fornecedores</li>
            <li>Confraternização (churrasco e chopp)</li>
            <li>Lançamento dos planos 2027 do ecossistema Confina+</li>
          </ul>

          <table className="cons-precos">
            <tbody>
              <tr><td>Clientes dos Produtos 1, 2 e 3</td><td>Gratuito</td></tr>
              <tr><td>Clientes do Produto 2</td><td>Direito a 1 acompanhante</td></tr>
              <tr><td>Assinantes da plataforma Confina+</td><td>R$ 250 (preço promocional)</td></tr>
              <tr><td>Público em geral</td><td>R$ 750</td></tr>
            </tbody>
          </table>

          <p className="cons-nota">Evento limitado. Próxima edição: 01/05/2027.</p>

          <a className="cons-btn cons-btn-primary" href={linkWhatsApp(MSG_PRODUTO_4)} target="_blank" rel="noreferrer">
            Entrar na lista de espera
          </a>
        </div>
      </section>

      {/* ESPECIALISTA */}
      <section className="cons-especialista">
        <h2 className="cons-section-title">Sobre o especialista</h2>
        <div className="cons-especialista-conteudo">
          <h3>Ricardo Schuch</h3>
          <p className="cons-especialista-local">Fazenda Dona Lucy II, São Gabriel (RS)</p>
          <ul className="cons-lista">
            <li>Engenheiro Agrônomo pela Universidade Federal de Santa Maria (2013)</li>
            <li>Pós-graduado em Gestão e Administração de Empresas pela FGV (2015)</li>
            <li>Certificado no programa Profesionalización Ganadera, com ênfase em recria e engorda de bovinos de corte (Argentina, 2020)</li>
            <li>Mais de 2 anos de experiência em sistemas de produção argentinos e uruguaios</li>
          </ul>
        </div>
      </section>

      {/* MÍDIA */}
      <section className="cons-midia">
        <h2 className="cons-section-title">Confina+ na mídia</h2>
        <a
          className="cons-midia-link"
          href="https://girodoboi.canalrural.com.br/pecuaria/conheca-a-fazenda-do-rs-que-produz-50-arrobas-por-hectare-ao-ano/"
          target="_blank"
          rel="noreferrer"
        >
          Canal Rural: conheça a fazenda do RS que produz 50 arrobas por hectare ao ano
        </a>
      </section>

      {/* CTA FINAL */}
      <section className="cons-cta-final">
        <a className="cons-btn cons-btn-primary" href={linkWhatsApp(MSG_GERAL)} target="_blank" rel="noreferrer">
          Falar com um especialista no WhatsApp
        </a>
      </section>

      {/* PARCEIROS */}
      <section className="cons-parceiros">
        <h2 className="cons-section-title">Torne-se um parceiro</h2>
        <p>
          Marcas e fornecedores que desejam fazer parte do ecossistema Confina+ e ter acesso à nossa
          tecnologia e comunidade.
        </p>
        <a className="cons-btn cons-btn-secundario" href={linkWhatsApp(MSG_PARCERIA)} target="_blank" rel="noreferrer">
          Torne-se um parceiro
        </a>
      </section>
    </div>
  )
}
