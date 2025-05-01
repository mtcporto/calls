# WebRTC Meet

## Descrição do Projeto
WebRTC Meet é uma aplicação web para videoconferências que permite aos usuários criar e participar de reuniões em tempo real usando WebRTC (Web Real-Time Communication). A aplicação oferece funcionalidades como compartilhamento de áudio e vídeo, controle de dispositivos, e uma interface intuitiva para interação entre os participantes.

## Tecnologias Utilizadas

### Frontend
- **HTML5**: Estruturação das páginas web
- **CSS3**: Estilização e layout responsivo
- **JavaScript**: Lógica de interação e comunicação em tempo real
- **Bootstrap 5**: Framework CSS para design responsivo
- **Font Awesome 5**: Ícones utilizados na interface

### Comunicação em Tempo Real
- **WebRTC**: API nativa para comunicação em tempo real entre navegadores
- **adapter.js**: Biblioteca para garantir compatibilidade do WebRTC entre diferentes navegadores

### Backend (em desenvolvimento)
- **Node.js**: Ambiente de execução JavaScript server-side
- **Express**: Framework web para criação do servidor de sinalização
- **Axios**: Cliente HTTP para comunicação com APIs externas

## Estrutura do Projeto

### Arquivos Principais
- **index.html**: Página inicial onde o usuário insere seu nome
- **sala.html**: Interface para criar ou entrar em uma reunião
- **calls.html**: Página principal da videoconferência
- **webrtc.js**: Módulo que contém a lógica WebRTC para conexões peer-to-peer
- **calls.js**: Script com funcionalidades específicas para a página de chamadas
- **backend.js**: Servidor Node.js para sinalização (em desenvolvimento)

## Funcionalidades

- Criação de salas de reunião com identificadores únicos
- Entrada em salas de reunião existentes através do nome da sala
- Transmissão de áudio e vídeo em tempo real
- Controles para ativar/desativar microfone e câmera
- Seleção de dispositivos de entrada e saída (câmera, microfone e alto-falantes)
- Interface responsiva adaptada para diferentes tamanhos de tela

## Como Usar

1. Acesse a página inicial e informe seu nome
2. Na página seguinte, escolha entre criar uma nova reunião ou entrar em uma existente
3. Se quiser criar uma nova reunião, clique em "Nova reunião"
4. Se quiser entrar em uma reunião existente, insira o nome da sala e clique em "Entrar"
5. Na sala de videoconferência, utilize os botões para controlar seu áudio e vídeo

## Instalação e Execução

1. Clone o repositório
2. Coloque os arquivos em um servidor web (como Apache ou Nginx)
3. Se desejar utilizar o backend para sinalização:
   ```
   npm install
   node backend.js
   ```

## Requisitos de Sistema
- Navegador moderno com suporte a WebRTC (Chrome, Firefox, Safari, Edge)
- Câmera e microfone para transmissão de áudio e vídeo
- Conexão à internet estável para comunicação em tempo real