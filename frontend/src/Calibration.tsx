import { sendSubmission } from './services/submissions'
import { useRef, useState, type MouseEvent } from 'react'

type Point = [number, number]
type Line = 'top' | 'bottom' | 'left' | 'right' | 'center' | 'center_spot'
const lines: { key: Line; label: string; color: string; help: string }[] = [
  { key: 'top', label: 'Linha superior', color: '#e9c968', help: 'Marque os pontos da linha superior, incluindo as extremidades.' },
  { key: 'bottom', label: 'Linha inferior', color: '#83d5ff', help: 'Marque os pontos da linha inferior, incluindo as extremidades.' },
  { key: 'left', label: 'Lateral esquerda', color: '#ff9b83', help: 'Marque os pontos da lateral esquerda, incluindo as extremidades.' },
  { key: 'right', label: 'Lateral direita', color: '#dba5ff', help: 'Marque os pontos da lateral direita, incluindo as extremidades.' },
  { key: 'center', label: 'Linha central (opcional)', color: '#a8e181', help: 'Marque a linha central, inclusive seus encontros com as linhas superior e inferior.' },
  { key: 'center_spot', label: 'Ponto central (opcional)', color: '#ffffff', help: 'Marque o ponto central do campo. É necessário marcar também a linha central.' },
]
const initial = (): Record<Line, Point[]> => ({ top: [], bottom: [], left: [], right: [], center: [], center_spot: [] })

export default function Calibration({ videoFile, videoUrl, onBack }: { videoFile: File; videoUrl: string; onBack: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const [mode, setMode] = useState<'mark' | 'file'>('mark')
  const [frame, setFrame] = useState<{ url: string; width: number; height: number; time: number } | null>(null)
  const [marks, setMarks] = useState(initial)
  const [selected, setSelected] = useState<Line>('top')
  const [cameraFile, setCameraFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [submissionId, setSubmissionId] = useState('')
  const active = lines.find(line => line.key === selected)!
  const complete = (['top', 'bottom', 'left', 'right'] as Line[]).every(key => marks[key].length >= 2)
    && (marks.center.length === 0 || marks.center.length >= 2)
    && (!marks.center_spot.length || marks.center.length >= 2)
  function capture() {
    const element = video.current
    if (!element || !element.videoWidth || !element.videoHeight || element.seeking || element.readyState < 2) { setError('Aguarde o carregamento do quadro antes de capturá-lo.'); return }
    const canvas = document.createElement('canvas'); canvas.width = element.videoWidth; canvas.height = element.videoHeight
    const context = canvas.getContext('2d'); if (!context) { setError('Não foi possível capturar o quadro neste navegador.'); return }
    context.drawImage(element, 0, 0); setFrame({ url: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height, time: element.currentTime }); setMarks(initial()); setSelected('top'); setZoom(1); setError('')
  }
  function changeZoom(nextZoom: number) {
    const next = Math.max(1, Math.min(4, nextZoom))
    const element = viewport.current
    if (!element || next === zoom) return
    const centerX = (element.scrollLeft + element.clientWidth / 2) / zoom
    const centerY = (element.scrollTop + element.clientHeight / 2) / zoom
    setZoom(next)
    requestAnimationFrame(() => {
      element.scrollLeft = centerX * next - element.clientWidth / 2
      element.scrollTop = centerY * next - element.clientHeight / 2
    })
  }
  function mark(event: MouseEvent<SVGSVGElement>) {
    if (!frame) return
    const rect = event.currentTarget.getBoundingClientRect()
    const point: Point = [Math.max(0, Math.min(frame.width - 1, Math.round((event.clientX - rect.left) / rect.width * frame.width))), Math.max(0, Math.min(frame.height - 1, Math.round((event.clientY - rect.top) / rect.height * frame.height)))]
    setMarks(previous => ({ ...previous, [selected]: selected === 'center_spot' ? [point] : [...previous[selected], point] }))
  }
  async function submit() {
    if (sending || (mode === 'mark' && (!frame || !complete)) || (mode === 'file' && !cameraFile)) return
    setSending(true); setError(''); setSubmissionId('')
    try {
      const fieldMarks = Object.fromEntries(lines.filter(line => marks[line.key].length).map(({ key }) => [key, key === 'center_spot' ? marks[key][0] : marks[key]]))
      const calibration = mode === 'mark' && frame ? { type: 'field' as const, data: { width: frame.width, height: frame.height, frame_time_seconds: frame.time, marks: fieldMarks } } : { type: 'camera' as const, file: cameraFile! }
      setSubmissionId(await sendSubmission(videoFile, calibration))
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Erro de conexão com o servidor.') }
    finally { setSending(false) }
  }
  function download() {
    if (!complete) return
    const data = lines.filter(line => marks[line.key].length).map(({ key }) => key === 'center_spot' ? `${key}: [${marks[key][0].join(', ')}]` : `${key}:\n${marks[key].map(point => `  - [${point.join(', ')}]`).join('\n')}`).join('\n') + '\n'
    const url = URL.createObjectURL(new Blob([data], { type: 'application/yaml' })); const link = document.createElement('a'); link.href = url; link.download = 'campo.yaml'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <main className="calibration-main"><div className="breadcrumb"><a href="#/">INÍCIO</a><span>/</span><button className="link-button" onClick={onBack}>VÍDEO</button><span>/</span><span>CALIBRAÇÃO</span></div><div className="cal-heading"><div className="eyebrow"><span className="eyebrow-dot"/> PREPARAR ANÁLISE</div><h1>Vamos reconhecer<br/><em>o campo.</em></h1><p>Marque as linhas em um quadro do vídeo ou selecione parâmetros de câmera já calculados.</p></div><div className="mode-switch" role="group" aria-label="Método de calibração"><button className={mode === 'mark' ? 'selected-mode' : ''} onClick={() => setMode('mark')}>Demarcar campo</button><button className={mode === 'file' ? 'selected-mode' : ''} onClick={() => setMode('file')}>Usar parâmetros de câmera</button></div>
  {mode === 'mark' ? <section className="cal-panel"><div className="cal-section-title"><div><span className="section-kicker">01 / ESCOLHA O QUADRO</span><h2>Encontre um bom momento</h2><p>Pause o vídeo em um quadro com as linhas do campo visíveis. As marcações serão removidas se você capturar outro quadro.</p></div></div><video className="cal-video" ref={video} src={videoUrl} controls preload="metadata"/><button className="button primary capture" onClick={capture}>Capturar quadro <span>↗</span></button>
  {frame && <><div className="cal-divider"/><div className="cal-section-title"><span className="section-kicker">02 / MARQUE O CAMPO</span><h2>Desenhe as linhas</h2><p>Selecione uma linha e clique em pelo menos dois pontos sobre ela. Para linhas curvas, adicione pontos intermediários. Use as extremidades nos cantos compartilhados.</p></div><div className="mark-layout"><div><div className="zoom-toolbar" role="group" aria-label="Zoom do quadro"><span>ZOOM DO QUADRO</span><div><button type="button" onClick={() => changeZoom(zoom - 0.25)} disabled={zoom <= 1} aria-label="Diminuir zoom">−</button><output aria-live="polite">{Math.round(zoom * 100)}%</output><button type="button" onClick={() => changeZoom(zoom + 0.25)} disabled={zoom >= 4} aria-label="Aumentar zoom">+</button><button type="button" className="zoom-reset" onClick={() => changeZoom(1)} disabled={zoom === 1}>Ajustar</button></div></div><p className="zoom-hint">Use as barras de rolagem para navegar pela imagem ampliada.</p><div className="mark-viewport" style={{ aspectRatio: `${frame.width} / ${frame.height}` }} ref={viewport} tabIndex={0} aria-label="Quadro de marcação com rolagem"><div className="mark-image" style={{width: `${zoom * 100}%`}}><img src={frame.url} alt={`Quadro capturado em ${frame.time.toFixed(1)} segundos`} /><svg viewBox={`0 0 ${frame.width} ${frame.height}`} preserveAspectRatio="none" onClick={mark} aria-label="Área de demarcação do campo">{lines.map(line => <g key={line.key}><polyline points={marks[line.key].map(p => p.join(',')).join(' ')} fill="none" stroke={line.color} strokeWidth={Math.max(2, frame.width / 450)}/>{marks[line.key].map((point, index) => <circle key={index} cx={point[0]} cy={point[1]} r={Math.max(5, frame.width / 180) / zoom} fill={line.color} stroke="#173824" strokeWidth={Math.max(1, frame.width / 900) / zoom}/>)}</g>)}</svg></div></div><p className="frame-caption">QUADRO EM {frame.time.toFixed(2)} S · {frame.width} × {frame.height} PX</p><p className="mark-help"><strong>{active.label}:</strong> {active.help}</p><div className="mark-actions"><button className="button outline" disabled={!marks[selected].length} onClick={() => setMarks(previous => ({...previous, [selected]: previous[selected].slice(0, -1)}))}>Desfazer último ponto</button><button className="text-action" disabled={!marks[selected].length} onClick={() => setMarks(previous => ({...previous, [selected]: []}))}>Limpar linha</button></div></div><div className="line-list">{lines.map(line => <button key={line.key} className={`line-option ${selected === line.key ? 'line-active' : ''}`} onClick={() => setSelected(line.key)}><span className="line-dot" style={{background: line.color}}/><span>{line.label}</span><small>{marks[line.key].length} {marks[line.key].length === 1 ? 'ponto' : 'pontos'}</small></button>)}</div></div><div className="cal-divider"/><div className="download-row"><div><strong>Exportar marcações</strong><p>Salve o YAML para usar com o ProjetoPDS-AI. As quatro linhas externas precisam ter pelo menos dois pontos.</p></div><button className="button primary" disabled={!complete} onClick={download}>Baixar campo.yaml ↓</button></div></>}</section> : <section className="cal-panel file-panel"><span className="section-kicker">PARÂMETROS EXISTENTES</span><h2>Selecione o arquivo da câmera</h2><p>Escolha um arquivo YAML gerado pelo ProjetoPDS-AI para este vídeo, com a mesma resolução e câmera fixa.</p><label className="camera-file">Selecionar arquivo YAML<input type="file" accept=".yaml,.yml,application/yaml,text/yaml" onChange={event => setCameraFile(event.target.files?.[0] ?? null)}/></label>{cameraFile && <p className="camera-selected">✓ {cameraFile.name} · {(cameraFile.size / 1024).toFixed(1)} KB</p>}<p className="cal-note">O arquivo será enviado junto ao vídeo. A validação dos parâmetros será feita na etapa de processamento.</p></section>}
  <div className="submission-actions"><button className="button primary" disabled={sending || (mode === 'mark' ? !frame || !complete : !cameraFile)} onClick={submit}>{sending ? 'Enviando…' : 'Enviar vídeo e calibração →'}</button>{error && <p className="error" role="alert">{error}</p>}{submissionId && <p className="submission-success" role="status">Dados recebidos. Identificador: {submissionId}</p>}</div><div className="cal-end"><button className="text-action" onClick={onBack}>← Voltar ao vídeo</button><span>O processamento e o cálculo dos parâmetros serão disponibilizados em uma próxima etapa.</span></div></main>
}
