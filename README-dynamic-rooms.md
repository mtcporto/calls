# WebRTC Video Chat com Salas Dinâmicas

Sistema de video conferência baseado em WebRTC com suporte para salas de reunião dinâmicas, usando Supabase como backend.

## Recursos

- Criação dinâmica de salas de reunião com nomes gerados automaticamente
- Entrada de usuários com qualquer nome
- Armazenamento de dados de salas no Supabase
- Exibição correta do container PIP (Picture-in-Picture)
- Servidor de sinalização com Cloudflare Workers

## Configuração

### 1. Configurar o Supabase

1. Crie uma conta no [Supabase](https://supabase.io/)
2. Crie um novo projeto
3. Crie uma tabela chamada `webrtc_rooms` com os seguintes campos:
   - `id` (tipo: uuid, padrão: uuid_generate_v4(), Chave primária)
   - `room_id` (tipo: text, Único)
   - `room_data` (tipo: jsonb)
   - `created_at` (tipo: timestamp with time zone, padrão: now())
   - `updated_at` (tipo: timestamp with time zone)
   - `expires_at` (tipo: timestamp with time zone)
4. Obtenha a URL e a API Key do seu projeto Supabase

### 2. Configurar as credenciais

1. Edite o arquivo `worker.js` diretamente e substitua os valores de exemplo pelas suas credenciais reais no início do arquivo:
```javascript
// Configurações do Supabase
const SUPABASE_URL = 'https://sua-url-supabase.supabase.co';
const SUPABASE_KEY = 'sua-chave-api-supabase';
```

### 3. Configurar o Cloudflare Worker

1. Copie o conteúdo do arquivo `worker.js` para o seu Worker no dashboard do Cloudflare

2. Edite o arquivo `webrtc.js` e atualize a URL do servidor de sinalização:
```javascript
const SIGNALING_SERVER = 'https://seu-worker.workers.dev/';
```

### 4. Configurar limpeza periódica (opcional)

1. Configure um Cron Trigger no Cloudflare Dashboard para chamar o endpoint `/cleanup` periodicamente
2. Ou use o endpoint `/cleanup?key=seu-token-secreto` para limpeza manual

## Uso

1. Abra `index.html` para criar uma nova sala ou entrar em uma sala existente
2. Digite seu nome para identificação
3. Para criar uma sala, um código será gerado automaticamente
4. Para entrar em uma sala, insira o código fornecido pelo criador da sala
5. Conceda as permissões para câmera e microfone quando solicitado

## Arquivos Principais

- `worker.js` - Servidor de sinalização que gerencia salas e comunicação via Supabase (use no Cloudflare Workers)
- `webrtc.js` - Cliente WebRTC que conecta ao servidor de sinalização
- `index.js` - Interface de criação e entrada em salas
- `styles.css` - Estilos da interface, incluindo a margin-top: -6% para o contêiner PIP
- `supabase-schema.sql` - Esquema SQL para criar a tabela no Supabase

## Tecnologias Utilizadas

- WebRTC
- Supabase (via API REST)
- Cloudflare Workers
- JavaScript puro (sem frameworks)

## Notas de Implementação

- O worker.js utiliza a API REST do Supabase diretamente em vez da biblioteca cliente, evitando a necessidade de importações de módulos
- Isso resolve o problema de erro: `Uncaught SyntaxError: Cannot use import statement outside a module`
- Para o funcionamento correto, certifique-se de que:
  1. As credenciais do Supabase estão corretamente configuradas no início do worker.js
  2. A tabela webrtc_rooms foi criada no Supabase conforme especificado
