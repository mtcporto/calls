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
