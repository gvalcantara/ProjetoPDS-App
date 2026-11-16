import { useEffect, useRef, useState } from 'react'
import { getSubmission, type Position, type Submission, type Trajectory } from './services/submissions'

function positionAt(trajectory: Trajectory, time: number): Position | undefined {
  const positions = trajectory.posicoes
  let low = 0, high = positions.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (positions[middle].instante < time) low = middle + 1
    else high = middle
  }
  const previous = positions[low - 1], next = positions[low]
  const closest = !previous ? next : !next ? previous : time - previous.instante <= next.instante - time ? previous : next
  return closest && Math.abs(closest.instante - time) <= 0.15 ? closest : undefined
}

export default function AnalysisResult({ id, videoUrl, onBack }: { id: string; videoUrl: string; onBack: () => void }) {
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [time, setTime] = useState(0)
  const video = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    async function poll() {
      try {
        const result = await getSubmission(id, controller.signal)
        if (controller.signal.aborted) return
        setSubmission(result)
        if (result.status === 'received' || result.status === 'processing') timer = setTimeout(poll, 2000)
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Erro de conexão com o servidor.')
      }
    }
    setError(''); poll()
    return () => { controller.abort(); if (timer) clearTimeout(timer) }
  }, [id, attempt])

  useEffect(() => {
    if (submission?.status !== 'completed') return
    let animation: number
    const update = () => { if (video.current) setTime(video.current.currentTime); animation = requestAnimationFrame(update) }
    animation = requestAnimationFrame(update)
    return () => cancelAnimationFrame(animation)
  }, [submission?.status])

  const positions = (submission?.trajetorias ?? []).flatMap(trajectory => {
    const position = positionAt(trajectory, time)
    return position && Math.abs(position.x) <= 1 && Math.abs(position.y) <= 1 ? [{ id: trajectory.id_rastreamento, ...position }] : []
  })

  return <main className="analysis-main">
    <div className="breadcrumb"><a href="#/">INÍCIO</a><span>/</span><span>ANÁLISE</span></div>
    <div className="analysis-heading"><span className="section-kicker">ANÁLISE DA PARTIDA</span><h1>{submission?.status === 'completed' ? 'O jogo, de outro ângulo.' : 'Preparando sua análise.'}</h1><p>Identificador: {id}</p></div>
    {error ? <section className="analysis-message" role="alert"><p>{error}</p><button className="button outline" onClick={() => setAttempt(value => value + 1)}>Tentar novamente</button></section>
      : submission?.status === 'failed' ? <section className="analysis-message" role="alert"><h2>Não foi possível processar o vídeo.</h2><p>{submission.error}</p><button className="button outline" onClick={onBack}>Voltar à calibração</button></section>
      : submission?.status !== 'completed' ? <section className="analysis-message" role="status"><span className="analysis-spinner" aria-hidden="true"/><h2>{submission?.status === 'processing' ? 'Processando o vídeo' : 'Aguardando processamento'}</h2><p>A extração pode levar alguns minutos. Mantenha esta página aberta.</p></section>
      : <><div className="analysis-grid"><section className="analysis-panel"><div className="analysis-panel-heading"><span>VÍDEO DA PARTIDA</span><span>{time.toFixed(1)} S</span></div><video ref={video} className="analysis-video" src={videoUrl} controls playsInline preload="metadata" onTimeUpdate={event => setTime(event.currentTarget.currentTime)}>Seu navegador não suporta a reprodução deste vídeo.</video></section>
        <section className="analysis-panel field-result"><div className="analysis-panel-heading"><span>POSIÇÕES NO CAMPO</span><span>{positions.length} EM CAMPO</span></div><div className="pitch result-pitch" aria-label={`Campo com ${positions.length} jogadores no instante ${time.toFixed(1)} segundos`}><div className="pitch-mid"/><div className="pitch-circle"/><div className="box box-left"/><div className="box box-right"/><div className="goal goal-left"/><div className="goal goal-right"/>{positions.map(position => <span className="player yellow result-player" key={position.id} style={{left: `${(position.x + 1) * 50}%`, top: `${(position.y + 1) * 50}%`}} title={`Jogador ${position.id}`}>{position.id}</span>)}</div><p className="analysis-caption">Posições estimadas sincronizadas com o vídeo. Os números identificam os rastreamentos.</p></section></div><button className="text-action analysis-back" onClick={onBack}>← Voltar à calibração</button></>}
  </main>
}
