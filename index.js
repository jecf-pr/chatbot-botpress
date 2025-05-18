import express from 'express';
import bodyParser from 'body-parser';
import fetch from 'node-fetch'; // npm install node-fetch@2
import process from 'process';

const app = express();

app.use((req, res, next) => {
  let rawData = '';
  req.on('data', chunk => {
    rawData += chunk;
  });
  req.on('end', () => {
    console.log("🔍 RAW BODY RECEBIDO:", rawData);
    next();
  });
});

// Middleware principal
app.use(bodyParser.json()); // Garante que o JSON será interpretado corretamente

// Middleware para debug de headers
app.use((req, res, next) => {
  console.log('DEBUG HEADERS:', req.headers);
  next();
});

// --- Configurações ---
const BOT_ID = process.env.BOT_ID;
const BOT_TOKEN = process.env.BOT_TOKEN;
const BOTPRESS_URL = 'https://api.botpress.cloud/v1/chat/messages';
const PORT = process.env.PORT || 3000;

if (!BOT_ID || !BOT_TOKEN) {
  console.error("ERRO: BOT_ID e/ou BOT_TOKEN não configurados nos Secrets.");
}

// --- Armazenamento Temporário ---
const botResponses = new Map(); // user_id -> resposta_bot

// --- 1. Recebe mensagem do MIT App Inventor ---
app.post('/send_message', async (req, res) => {
  console.log("DEBUG /send_message req.body:", req.body);

  const { user_id, message } = req.body;

  if (!user_id || !message) {
    return res.status(400).json({ status: "error", message: "Missing user_id or message" });
  }

  const botpressPayload = {
    type: "text",
    text: message,
    sender: { id: user_id, role: "user" }
  };

  const headers = {
    'Authorization': `Bearer ${BOT_TOKEN}`,
    'X-Bot-Id': BOT_ID,
    'Content-Type': 'application/json'
  };

  try {
    const bpRes = await fetch(BOTPRESS_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(botpressPayload)
    });

    const result = await bpRes.json();
    console.log("DEBUG Botpress Response:", result);

    res.json({ status: "success", message: "Message sent to Botpress" });
  } catch (error) {
    console.error("Error sending to Botpress:", error);
    res.status(500).json({ status: "error", message: "Failed to send to Botpress" });
  }
});

// --- 2. Webhook do Botpress ---
app.post('/webhook_botpress', (req, res) => {
  try {
    const data = req.body;
    console.log("DEBUG /webhook_botpress req.body:", data);

    const messages = data?.messages;
    const userId = data?.user?.id;

    if (Array.isArray(messages) && messages.length > 0 && userId) {
      const textMessage = messages.find(m => m.type === 'text');
      if (textMessage) {
        botResponses.set(userId, textMessage.text);
        console.log(`Resposta do bot armazenada para ${userId}: ${textMessage.text}`);
      } else {
        console.log("Mensagem recebida no webhook, mas sem texto.");
      }
    } else {
      console.log("Webhook recebido, estrutura da mensagem inválida ou userId ausente.");
    }
  } catch (error) {
    console.error("Error processing webhook:", error);
  }

  res.sendStatus(200);
});

// --- 3. Endpoint para pegar resposta do bot ---
app.post('/get_response', (req, res) => {
  console.log("DEBUG /get_response req.body:", req.body);

  const { user_id } = req.body;

  if (!user_id) {
    return res.status(400).json({ status: "error", message: "Missing user_id" });
  }

  const response = botResponses.get(user_id);

  if (response) {
    botResponses.delete(user_id); // Limpa após entregar
    res.json({ status: "ok", response });
  } else {
    res.json({ status: "waiting" });
  }
});

// --- Teste ---
app.get('/', (req, res) => {
  res.send("Servidor rodando!");
});

// --- Iniciar servidor ---
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`Configure o webhook do Botpress para: SUA_URL_REPLIT/webhook_botpress`);
});
