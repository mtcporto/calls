// Código para o Cloudflare Worker (signaling.js)
// Versão com Supabase para armazenamento persistente usando API REST

// Configurações do Supabase
const SUPABASE_URL = 'https://supabase-url.supabase.co'; // Substitua pela URL real do seu projeto Supabase
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjcGd4eWZ1Z2xheG90bWpncXdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY1NzQ1MzIsImV4cCI6MjA2MjE1MDUzMn0.jl1UAVCIgkHXqgZyLwAfuMtbr_xbblLQdDH2vMVXKdw'; // Substitua pela sua API Key do Supabase

// Utilidades para estruturas de dados
const encoder = new TextEncoder();
const decoder = new TextDecoder();

// Helpers para lidar com Supabase via API REST
async function getRoomData(roomId) {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/webrtc_rooms?room_id=eq.${encodeURIComponent(roomId)}&select=room_data`, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      }
    });
    
    if (!response.ok) {
      console.error(`Erro ao recuperar sala ${roomId}: ${response.status} ${response.statusText}`);
      return { users: {}, signals: [] };
    }
    
    const data = await response.json();
    return data.length > 0 ? data[0].room_data : { users: {}, signals: [] };
  } catch (error) {
    console.error(`Exceção ao recuperar sala ${roomId}:`, error);
    return { users: {}, signals: [] };
  }
}

async function saveRoomData(roomId, data) {
  try {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 86400 * 1000); // 24 horas depois
    
    // Verificar se a sala já existe
    const checkResponse = await fetch(`${SUPABASE_URL}/rest/v1/webrtc_rooms?room_id=eq.${encodeURIComponent(roomId)}&select=id`, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_KEY,
        'Content-Type': 'application/json'
      }
    });
    
    if (!checkResponse.ok) {
      console.error(`Erro ao verificar sala ${roomId}: ${checkResponse.status} ${checkResponse.statusText}`);
      return;
    }
    
    const existingRooms = await checkResponse.json();
    const roomExists = existingRooms.length > 0;
    
    // Preparar os dados
    const roomData = {
      room_data: data,
      updated_at: now.toISOString(),
      expires_at: expiresAt.toISOString()
    };
    
    let response;
    
    if (roomExists) {
      // Atualizar sala existente
      response = await fetch(`${SUPABASE_URL}/rest/v1/webrtc_rooms?room_id=eq.${encodeURIComponent(roomId)}`, {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(roomData)
      });
    } else {
      // Criar nova sala
      roomData.room_id = roomId;
      roomData.created_at = now.toISOString();
      
      response = await fetch(`${SUPABASE_URL}/rest/v1/webrtc_rooms`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(roomData)
      });
    }
    
    if (!response.ok) {
      console.error(`Erro ao ${roomExists ? 'atualizar' : 'criar'} sala ${roomId}: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error(`Exceção ao salvar sala ${roomId}:`, error);
  }
}

async function cleanupRooms() {
  try {
    const now = new Date().toISOString();
    
    // Remover salas expiradas
    const response = await fetch(`${SUPABASE_URL}/rest/v1/webrtc_rooms?expires_at=lt.${encodeURIComponent(now)}`, {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      }
    });
    
    if (!response.ok) {
      console.error(`Erro ao limpar salas expiradas: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error('Exceção ao limpar salas expiradas:', error);
  }
}

// Não podemos usar setInterval no escopo global em Cloudflare Workers
// A limpeza será chamada periodicamente através de um gatilho externo ou cron trigger

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  
  // Adicione headers para CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  
  // Handle preflight CORS
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers });
  }
  
  if (url.pathname === '/join') {
    try {
      const data = await request.json();
      const { room, id, name } = data;
      
      if (!room || !id) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Parâmetros inválidos' 
        }), {
          headers: {
            ...headers,
            'Content-Type': 'application/json'
          },
          status: 400
        });
      }
      
      // Obter dados da sala do KV
      const roomData = await getRoomData(room);
      
      // Registrar usuário na sala
      const now = Date.now();
      roomData.users[id] = { 
        id, 
        name: name || 'Anônimo', 
        timestamp: now
      };
      
      // Remover usuários inativos (mais de 5 minutos)
      Object.keys(roomData.users).forEach(userId => {
        if (now - roomData.users[userId].timestamp > 300000) {
          console.log(`Removendo usuário inativo ${userId} da sala ${room}`);
          delete roomData.users[userId];
        }
      });
      
      // Salvar alterações de volta no KV
      await saveRoomData(room, roomData);
      
      return new Response(JSON.stringify({
        success: true,
        users: Object.values(roomData.users)
      }), {
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        }
      });
    } catch (error) {
      console.error('Erro no endpoint /join:', error);
      return new Response(JSON.stringify({
        success: false,
        error: 'Erro interno do servidor'
      }), {
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        status: 500
      });
    }
  }
  
  if (url.pathname === '/signal') {
    try {
      const data = await request.json();
      const { sender, target, type, data: signalData, room } = data;
      
      if (!sender || !target || !type || !room) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Parâmetros inválidos' 
        }), {
          headers: {
            ...headers,
            'Content-Type': 'application/json'
          },
          status: 400
        });
      }
      
      // Obter dados da sala
      const roomData = await getRoomData(room);
      
      // Verificar se os usuários existem
      if (!roomData.users[sender]) {
        console.log(`Adicionando usuário ${sender} que estava ausente`);
        roomData.users[sender] = {
          id: sender,
          name: data.name || "Reconectado",
          timestamp: Date.now()
        };
      } else {
        // Atualizar timestamp do remetente
        roomData.users[sender].timestamp = Date.now();
      }
      
      console.log(`Sinal ${type} de ${sender} para ${target} na sala ${room}`);
      
      // Adicionar ID único para evitar duplicatas
      const signalId = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
      
      // Adicionar sinal à sala
      if (!roomData.signals) {
        roomData.signals = [];
      }
      
      roomData.signals.push({
        id: signalId,
        sender,
        target,
        type,
        data: signalData,
        name: roomData.users[sender]?.name,
        timestamp: Date.now()
      });
      
      // Limitar número de sinais armazenados
      if (roomData.signals.length > 200) {
        roomData.signals = roomData.signals.slice(-200);
      }
      
      // Salvar alterações
      await saveRoomData(room, roomData);
      
      return new Response(JSON.stringify({ 
        success: true,
        signalId
      }), {
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        }
      });
    } catch (error) {
      console.error('Erro no endpoint /signal:', error);
      return new Response(JSON.stringify({
        success: false,
        error: 'Erro interno do servidor'
      }), {
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        status: 500
      });
    }
  }
  
  // Melhorias no endpoint /poll
  if (url.pathname === '/poll') {
    try {
      const roomId = url.searchParams.get('room');
      const userId = url.searchParams.get('id');
      const lastTimestamp = parseInt(url.searchParams.get('last') || '0');
      
      if (!roomId || !userId) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Parâmetros inválidos' 
        }), {
          headers: {
            ...headers,
            'Content-Type': 'application/json'
          },
          status: 400
        });
      }
      
      // Obter dados da sala
      const roomData = await getRoomData(roomId);
      
      // Marcar como ativo
      if (roomData.users[userId]) {
        roomData.users[userId].timestamp = Date.now();
      } else {
        // Adicionar usuário à sala se não existir
        roomData.users[userId] = { 
          id: userId, 
          name: 'Reconectado', 
          timestamp: Date.now() 
        };
      }
      
      // Filtrar sinais vencidos (mais de 2 minutos)
      const now = Date.now();
      if (roomData.signals) {
        roomData.signals = roomData.signals.filter(
          signal => now - signal.timestamp < 120000
        );
      } else {
        roomData.signals = [];
      }
      
      // Buscar sinais pendentes para este usuário
      const pendingSignals = roomData.signals.filter(
        signal => signal.target === userId && signal.timestamp > lastTimestamp
      );
      
      // Remover usuários inativos (mais de 2 minutos)
      const usersToRemove = [];
      for (const otherUserId in roomData.users) {
        if (now - roomData.users[otherUserId].timestamp > 120000) {
          console.log(`Removendo usuário inativo ${otherUserId} da sala ${roomId}`);
          usersToRemove.push(otherUserId);
        }
      }
      
      usersToRemove.forEach(id => delete roomData.users[id]);
      
      // Salvar alterações
      await saveRoomData(roomId, roomData);
      
      console.log(`Poll de ${userId}: sala=${roomId}, ${pendingSignals.length} sinais, ${Object.keys(roomData.users).length} usuários`);
      
      return new Response(JSON.stringify({
        success: true,
        signals: pendingSignals,
        users: Object.values(roomData.users)
      }), {
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        }
      });
    } catch (error) {
      console.error('Erro no endpoint /poll:', error);
      return new Response(JSON.stringify({
        success: false,
        error: 'Erro interno do servidor'
      }), {
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        status: 500
      });
    }
  }
  
  // Adicionar endpoint para verificação de status
  if (url.pathname === '/status') {
    try {
      // Obter todas as salas ativas do Supabase
      const now = new Date().toISOString();
      const response = await fetch(`${SUPABASE_URL}/rest/v1/webrtc_rooms?select=room_id,room_data&expires_at=gt.${encodeURIComponent(now)}`, {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_KEY,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Erro ao obter salas: ${response.status} ${response.statusText}`);
      }
      
      const rooms = await response.json();
      
      // Calcular estatísticas
      let totalUsers = 0;
      let totalSignals = 0;
      let roomsData = {};
      
      for (const room of rooms) {
        const roomData = room.room_data;
        const userCount = Object.keys(roomData.users || {}).length;
        const signalCount = (roomData.signals || []).length;
        
        totalUsers += userCount;
        totalSignals += signalCount;
        
        roomsData[room.room_id] = {
          users: userCount,
          signals: signalCount
        };
      }
      
      return new Response(JSON.stringify({
        success: true,
        status: "online",
        stats: {
          rooms: rooms.length,
          totalUsers,
          totalSignals,
          roomsData
        },
        timestamp: new Date().toISOString()
      }), {
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        }
      });
    } catch (error) {
      console.error('Erro no endpoint /status:', error);
      return new Response(JSON.stringify({
        success: false,
        error: 'Erro ao buscar status'
      }), {
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        status: 500
      });
    }
  }
  
  // Endpoint para limpeza manual de salas expiradas - pode ser configurado como um Cron trigger
  if (url.pathname === '/cleanup' && (url.searchParams.get('key') === 'seu-token-secreto' || request.headers.get('Authorization') === 'Bearer seu-token-secreto')) {
    try {
      await cleanupRooms();
      return new Response(JSON.stringify({
        success: true,
        message: "Limpeza concluída com sucesso"
      }), {
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        }
      });
    } catch (error) {
      return new Response(JSON.stringify({
        success: false,
        error: "Erro durante a limpeza"
      }), {
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        status: 500
      });
    }
  }
  
  return new Response('Not Found', { 
    status: 404, 
    headers 
  });
}