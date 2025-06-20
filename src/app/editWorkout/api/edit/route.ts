import {
  Message as VercelChatMessage,
  StreamingTextResponse,
  createStreamDataTransformer
} from 'ai';

import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { HttpResponseOutputParser } from 'langchain/output_parsers';
import jwt from 'jsonwebtoken';

export const dynamic = 'force-dynamic';

let conversationHistory = '';
let qaHistory: { question: string, answer: string }[] = [];

const formatMessage = (message: VercelChatMessage) => {
  return `${message.role}: ${message.content}`;
};

const TEMPLATE = `
You are CoachConnect: a warm, motivating, and expert-level AI fitness coach. Be friendly, supportive, and concise — like a real personal trainer who cares.

Here is the user's current workout plan:
{user_workout}

Follow this exact process every time:

1. First, ask the user:
   "What would you like me to change or adjust in your current workout routine?"

2. Wait for the user's reply.

3. Then ask:
   "Is there anything else you'd like me to change or adjust in your current workout routine?"

4. If the user says "no", "nothing", or gives a similar negative response, you must always do the following:

   a. Ask:
   "Before I proceed — are you okay with me updating your current routine based on everything we've discussed?"

   b. If the user replies with any confirmation (like “yes”, “sure”, “ok”), then always respond:
   "Great! I’ll now update your workout plan — just a moment..."

   Do not include the updated routine in this message. That response must end there.

If the user provides changes or adjustments at any point, acknowledge them positively and say you're updating the plan.

Always keep your tone friendly, encouraging, and professional.

Current conversation:  
{chat_history}

user: {input}  
assistant:
`;


export async function POST(req: Request) {
  console.log(">>> Nueva solicitud POST recibida por CoachConnect");

  try {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return Response.json({ error: 'Token missing' }, { status: 401 });
    }

    console.log("✅ Token recibido:", token);

    // Decodificar el token para obtener userId
    let userId;
    try {
      const decoded: any = jwt.decode(token);
      userId = decoded?.user_id || decoded?.uid || decoded?.sub;
      if (!userId) throw new Error("User ID not found in token");
      console.log("👤 userId decodificado:", userId);
    } catch (decodeError) {
      console.error("❌ Error al decodificar el token:", decodeError);
      return Response.json({ error: 'Invalid token format' }, { status: 400 });
    }

    // Obtener la rutina actual del usuario
    let workoutUser = null;
    try {
      const getResponse = await fetch(`https://ia-workout-api.fly.dev/api/workout/user/${userId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!getResponse.ok) {
        console.warn("⚠️ No se encontró rutina activa para el usuario:", userId);
      } else {
        workoutUser = await getResponse.json();
        console.log("📥 Rutina actual obtenida:", workoutUser);
      }
    } catch (fetchError) {
      console.error("❌ Error al hacer GET de rutina:", fetchError);
    }

    const { messages }: { messages: VercelChatMessage[] } = await req.json();
    const formattedPreviousMessages = messages.slice(0, -1).map(formatMessage).join('\n');
    const currentMessageContent = messages.at(-1)?.content || '';

    conversationHistory += `$bot: ${formattedPreviousMessages} \n`;

    messages.slice(0, -1).forEach((message: VercelChatMessage, index: number) => {
      if (index % 2 === 0) {
        qaHistory.push({ question: message.content, answer: messages[index + 1]?.content || '' });
      }
    });

    const prompt = PromptTemplate.fromTemplate(TEMPLATE);

    const model = new ChatOpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
      model: 'ft:gpt-4.1-mini-2025-04-14:personal:coach-connect:BOZ5t36c',
      temperature: 0.8,
      verbose: true,
    });

    const parser = new HttpResponseOutputParser();

    const chain = prompt.pipe(model.bind({ stop: ["assistant"] })).pipe(parser);

    const stream = await chain.stream({
      chat_history: formattedPreviousMessages,
      input: currentMessageContent,
      user_workout: workoutUser ? JSON.stringify(workoutUser, null, 2) : "The user has no active workout routine."
    });

    const finalResponse = new StreamingTextResponse(
      stream.pipeThrough(createStreamDataTransformer()),
    );

    const removeEmojis = (text: string) => {
      return text.replace(/[^\x00-\x7F]/g, '');
    };

    const cleanedQAHistory = qaHistory.map(({ question, answer }) => ({
      question: removeEmojis(question),
      answer: removeEmojis(answer),
    }));

    const uniqueQAHistory = cleanedQAHistory.filter((value, index, self) =>
      index === self.findIndex((t) =>
        t.question === value.question && t.answer === value.answer
      )
    );

    const uniqueQAHistoryJson = JSON.stringify(uniqueQAHistory, null, 2);
    console.log("📋 QA History:\n", uniqueQAHistoryJson);

    console.log("🔍 Verificando si se completó el onboarding...");
    console.log("Últimos mensajes del usuario:\n", formattedPreviousMessages);

    const finalQuestionDetected =
      formattedPreviousMessages.includes("Before I proceed") ||
      formattedPreviousMessages.includes("Is there anything you'd like me to change");

    if (finalQuestionDetected) {
      console.log("✅ Onboarding detectado como completo. Procediendo a enviar datos al backend...");

      (async () => {
        try {
          console.log("📡 Enviando POST a ia-workout-api.fly.dev/api/editWorkout con token:", token);
          console.log("📦 Payload:\n", uniqueQAHistoryJson);

          const response = await fetch("https://ia-workout-api.fly.dev/api/editWorkout", {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: uniqueQAHistoryJson
          });

          const responseData = await response.json();
          console.log("✅ Respuesta del servicio externo:", responseData);
        } catch (error) {
          console.error("❌ Error al enviar datos al servicio externo:", error);
        }
      })();
    } else {
      console.log("🕓 El onboarding aún no está completo. No se dispara el POST.");
    }

    return finalResponse;

  } catch (e: any) {
    console.error("❌ Error general en POST /api/chat:", e);
    return Response.json({ error: e.message }, { status: e.status ?? 500 });
  }
}
