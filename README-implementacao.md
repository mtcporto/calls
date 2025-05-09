# WebRTC Meet - Implementação Completa com Supabase

Sistema de videoconferência baseado em WebRTC com suporte para salas de reunião dinâmicas, utilizando Supabase como backend para persistência de dados.

## Recursos Implementados

- Criação dinâmica de salas de reunião com nomes gerados automaticamente
- Entrada de usuários com nome personalizado
- Armazenamento de dados de salas no Supabase via API REST
- Exibição correta do container PIP (Picture-in-Picture)
- Resolver problemas de conectividade com o servidor de sinalização

## Arquitetura do Sistema

### Frontend
- Interface responsiva para acesso em dispositivos desktop e mobile
- Configuração de câmera e microfone
- Visualização de todos os participantes
- Funcionalidades de compartilhamento de tela
- Controle de áudio e vídeo

### Backend
- Servidor de sinalização via Cloudflare Workers
- Armazenamento de dados no Supabase
- Limpeza automática de salas expiradas
- Diagnóstico e recuperação automática de erros

## Configuração

### 1. Requisitos do Sistema

- Navegador moderno com suporte a WebRTC (Chrome, Firefox, Edge ou Safari)
- Conexão à internet com acesso ao Supabase
- Câmera e microfone (recomendado)

### 2. Configuração da Tabela Supabase

1. Execute o script SQL abaixo no editor SQL do Supabase:

```sql
-- SQL para criar a tabela webrtc_rooms no Supabase
CREATE TABLE IF NOT EXISTS public.webrtc_rooms (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    room_id text UNIQUE NOT NULL,
    room_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL
);

-- Criar índice para melhor performance
CREATE INDEX IF NOT EXISTS webrtc_rooms_room_id_idx ON public.webrtc_rooms (room_id);
CREATE INDEX IF NOT EXISTS webrtc_rooms_expires_at_idx ON public.webrtc_rooms (expires_at);

-- Função para atualizar o timestamp updated_at
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para atualizar o timestamp automaticamente
DROP TRIGGER IF EXISTS update_webrtc_rooms_modtime ON public.webrtc_rooms;
CREATE TRIGGER update_webrtc_rooms_modtime
BEFORE UPDATE ON public.webrtc_rooms
FOR EACH ROW
EXECUTE PROCEDURE update_modified_column();
```

### 3. Configuração do Cloudflare Worker

1. Crie um novo Worker no dashboard do Cloudflare
2. Copie o conteúdo do arquivo `worker.js` para o seu Worker
3. Publique o Worker com o nome `webrtc-signaling`
4. Configure a rota de domínio desejada (ex: webrtc-signaling.yourdomain.workers.dev)

### 4. Configuração da Limpeza de Salas

Opções para limpeza de salas expiradas:
1. **Automática via Cron Trigger**: Configure um gatilho de cron para chamar o endpoint `/cleanup?key=seu-token-secreto` periodicamente (recomendado a cada 6 horas)
2. **Manual**: Use o endpoint `/cleanup?key=seu-token-secreto` para limpeza manual quando necessário
3. **Verificação**: Use o endpoint `/tablestatus` para verificar o número de salas armazenadas

## Uso do Sistema

### Criação de Nova Sala
1. Acesse a página inicial `index.html`
2. Digite seu nome no formulário "Criar Reunião"
3. Clique em "Iniciar Reunião"
4. Um código de sala será gerado automaticamente (formato: xxx-xxxx-xxx)
5. Compartilhe este código com outros participantes

### Entrar em Sala Existente
1. Acesse a página inicial `index.html`
2. Clique em "Entrar em sala existente"
3. Digite seu nome e o código da sala fornecido
4. Clique em "Entrar na Reunião"

### Durante a Reunião
- Use os botões na parte inferior para controlar áudio e vídeo
- Clique no ícone de configurações para alterar dispositivos
- Participantes serão exibidos na lateral direita em formato PIP
- Para compartilhar o link da reunião, clique no ícone de compartilhamento

## Resolução de Problemas

### Ferramentas de Diagnóstico
- `diagnostico.html`: Página web para verificação de todos os componentes
- `supabase-check.html`: Ferramenta para testar a conexão com o Supabase
- `diagnose.sh`: Script para diagnóstico via terminal

### Problemas Comuns

1. **"Erro ao conectar ao servidor de sinalização"**
   - Verifique se o Cloudflare Worker está publicado e acessível
   - Confirme a URL do servidor no arquivo `webrtc.js`
   
2. **"Erro ao acessar tabela webrtc_rooms"**
   - Verifique se a tabela foi criada no Supabase
   - Confirme que as chaves de API estão configuradas corretamente
   
3. **"Não é possível ver outros participantes"**
   - Verifique se todos os participantes estão na mesma sala
   - Confirme que os dispositivos de câmera e microfone estão funcionando
   - Verifique se há bloqueios de firewall impedindo conexões WebRTC

## Arquivos do Projeto

- `worker.js`: Servidor de sinalização (Cloudflare Workers)
- `webrtc.js`: Cliente WebRTC para gerenciamento de conexões
- `calls.js`: Lógica principal da aplicação de videoconferência
- `calls.html`: Interface da sala de videoconferência
- `index.js`: Lógica da página inicial para criação/entrada em salas
- `index.html`: Interface da página inicial
- `setup-check.js`: Verificações de configuração do ambiente
- `webrtc-diagnostic.js`: Diagnóstico e recuperação automática
- `supabase-schema.sql`: Schema SQL para o banco de dados
- `diagnose.sh`: Script de diagnóstico via terminal
- `diagnostico.html`: Ferramenta web de diagnóstico
- `supabase-check.html`: Ferramenta para testar conexão com Supabase

## Considerações Técnicas

1. **Autenticação Supabase**: Todas as requisições ao Supabase devem incluir os headers `apikey` e `Authorization: Bearer TOKEN`
2. **Expiração de Salas**: As salas expiram após 24 horas de inatividade
3. **Limpeza de Usuários**: Usuários inativos são removidos após 5 minutos
4. **PIP Container**: O container PIP está configurado com `position: absolute` e margens específicas para garantir visualização correta em todos os dispositivos
5. **Compatibilidade**: A implementação é compatível com todos os navegadores modernos que suportam WebRTC
