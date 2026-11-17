import { SimuladorTela } from '@/pages/Simulador'
import { usePortal } from '@/portal/PortalContext'
import { useSimuladorFornecedor } from '@/portal/simuladorPortal'

// Simulador no portal: o vendedor monta caminhos com os produtos e as dietas
// do catálogo (com o preço de referência) e exporta o resultado em PDF para
// o produtor. Cada vendedor vê as suas; o gestor vê as da equipe.
export default function SimuladorPortal() {
  const { papel } = usePortal()
  const sim = useSimuladorFornecedor()
  const nomeF = sim.fornecedor?.nome ?? ''
  const nomeMembro = (id: string) => sim.membros.find(m => m.id === id)?.nome ?? 'Equipe'

  return (
    <SimuladorTela
      simulacoes={sim.simulacoes}
      loading={sim.loading}
      criar={sim.criar}
      salvar={sim.salvar}
      excluir={sim.excluir}
      dietas={sim.dietas}
      ingredientes={sim.ingredientes}
      podeCriar={!!sim.membro}
      avisoCriar="Simulações são criadas pelos membros da equipe do fornecedor."
      subtitulo={`Monte caminhos com os produtos e dietas ${nomeF} e exporte o resultado em PDF para o produtor`}
      textoCopiarDieta={`Usar dieta ${nomeF}...`}
      marcarProprio={false}
      podeEditar={s => s.membro_id === sim.membro?.id}
      infoCard={s => papel === 'gestor' && s.membro_id !== sim.membro?.id
        ? <div style={{ fontSize: 12, color: 'var(--text-2)' }}>Vendedor: {nomeMembro(s.membro_id)}</div>
        : null}
      acoesEditor={(id, sujo) => (
        <button type="button" className="btn btn-secondary" disabled={!id || sujo}
          title={!id || sujo ? 'Salve a simulação para exportar' : undefined}
          onClick={() => { if (id) window.open(`/simulacao-pdf?id=${id}`, '_blank') }}>
          Exportar PDF
        </button>
      )}
    />
  )
}
