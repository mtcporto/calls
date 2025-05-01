const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const appId = 'YOUR_APP_ID';
const appSecret = 'YOUR_APP_SECRET';
const cloudflareBaseUrl = 'https://api.cloudflare.com/client/v4';

async function createSession() {
    const response = await axios.post(`${cloudflareBaseUrl}/calls/apps/${appId}/sessions`, null, {
        headers: {
            'Authorization': `Bearer ${appSecret}`
        }
    });
    return response.data;
}

async function createTrack(sessionId) {
    const response = await axios.post(`${cloudflareBaseUrl}/calls/apps/${appId}/sessions/${sessionId}/tracks`, null, {
        headers: {
            'Authorization': `Bearer ${appSecret}`
        }
    });
    return response.data;
}

app.post('/createSession', async (req, res) => {
    try {
        const session = await createSession();
        res.json(session);
    } catch (error) {
        console.error('Error creating session:', error);
        res.status(500).send('Error creating session');
    }
});

app.post('/createTrack/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    try {
        const track = await createTrack(sessionId);
        res.json(track);
    } catch (error) {
        console.error('Error creating track:', error);
        res.status(500).send('Error creating track');
    }
});

app.listen(3000, () => {
    console.log('Server is running on port 3000');
});
