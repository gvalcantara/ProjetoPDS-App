# Hattrick

Aplicação experimental de análise de partidas de futebol, com frontend React/TypeScript e backend Python/FastAPI.

## Executar localmente

Requisitos: Python 3.10 ou superior e Node.js 20, 22 ou superior (o Vite 6 também aceita Node.js 18).

### Backend

Na raiz do repositório, execute os comandos abaixo para criar o ambiente virtual, instalar as dependências e iniciar a API:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

A API estará disponível em `http://127.0.0.1:8000`. Para conferir se está ativa, acesse `http://127.0.0.1:8000/api/health`; a documentação interativa fica em `http://127.0.0.1:8000/docs`. Mantenha esse terminal aberto.

Nas próximas execuções, basta entrar em `backend`, ativar o ambiente com `source .venv/bin/activate` e executar novamente o comando `uvicorn` acima. Para encerrar a API, pressione `Ctrl+C`.

### Frontend

Em outro terminal, a partir da raiz do repositório, inicie a interface:

```bash
cd frontend
npm install
npm run dev
```

Abra o endereço informado pelo Vite. Para acessar de outro dispositivo na rede, execute `npm run dev -- --host 0.0.0.0` e abra o endereço de rede indicado. O Vite encaminha `/api` para a API local na porta 8000.

## Envio e calibração

Selecione um vídeo e avance para a calibração. Pause no quadro desejado, capture-o e marque as quatro linhas externas com pelo menos dois pontos cada. A linha e o ponto centrais são opcionais; o ponto central requer a linha central. Use os controles de zoom e as barras de rolagem para inspecionar o quadro. As coordenadas são registradas em pixels da resolução original e acompanham o instante do quadro.

Também é possível selecionar um YAML de parâmetros de câmera previamente gerado. O botão de envio armazena o vídeo e os dados selecionados em `storage/<id>/`; configure `HATTRICK_STORAGE` para escolher outro diretório. O backend valida a estrutura e os limites das marcações, mas ainda não valida o conteúdo do vídeo nem os parâmetros de câmera. O processamento e o cálculo da calibração serão implementados posteriormente. As marcações pressupõem câmera fixa.

A API oferece `POST /api/submissions` com `multipart/form-data`: `video`, `calibration_type` (`field` ou `camera`) e, respectivamente, `field_data` (JSON com `width`, `height`, `frame_time_seconds` e `marks`) ou `camera` (arquivo YAML). A documentação interativa está em `http://127.0.0.1:8000/docs`.

## Testes

```bash
cd backend
pip install -r requirements-dev.txt
python -m pytest
cd ../frontend
npm run build
```
