# Hattrick

Interface experimental para análise de partidas de futebol. O frontend está em `frontend/` e foi desenvolvido com React, TypeScript e Vite.

## Executar localmente

Instale o Node.js 20, 22 ou superior (o Vite 6 também aceita Node.js 18). Confirme a versão com `node --version` e execute:

```bash
cd frontend
npm install
npm run dev
```

Abra o endereço informado no terminal. Para verificar a compilação, execute `npm run build`.

A seleção de vídeo é local e permite visualizar o arquivo no navegador. A API de upload e o processamento ainda não foram implementados; nenhum arquivo é enviado ao servidor nesta versão.

## Calibração do campo

Após selecionar o vídeo, avance para a calibração. Pause no quadro desejado, capture-o e marque as quatro linhas externas com pelo menos dois pontos cada. A linha central e o ponto central são opcionais; o ponto central requer a linha central. Exporte `campo.yaml` para usar com o ProjetoPDS-AI. As coordenadas correspondem à resolução original do vídeo e ao quadro capturado; as marcações requerem câmera fixa.

Também é possível selecionar um YAML de parâmetros de câmera previamente gerado para a mesma resolução. Nesta versão, a seleção permanece no navegador: o arquivo não é enviado nem validado, e o cálculo da calibração depende da futura integração com o backend.

Na demarcação, use os controles de zoom e as barras de rolagem para inspecionar o quadro. As marcações exportadas continuam em pixels da resolução original.
