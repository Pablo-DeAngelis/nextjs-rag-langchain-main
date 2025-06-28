import {
    Message as VercelChatMessage,
    StreamingTextResponse,
    createStreamDataTransformer
} from 'ai';
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { HttpResponseOutputParser } from 'langchain/output_parsers';

export const dynamic = 'force-dynamic';

let conversationHistory = '';
let qaHistory: { question: string, answer: string }[] = [];

const formatMessage = (message: VercelChatMessage) => {
    return `${message.role}: ${message.content}`;
};

export async function POST(req: Request) {
    console.log(">>> Nueva solicitud POST recibida por CoachConnect");
    
    try {
        const token = req.headers.get('Authorization')?.replace('Bearer ', '');
        console.log("✅ Token recibido:", token);

        const TEMPLATE = `
You are CoachConnect: a warm, motivating, and expert-level AI fitness coach. Guide the user through the following onboarding questions one at a time. Always wait for the user to answer before asking the next. Keep your tone friendly and supportive, like a real personal coach. Don't dump multiple questions at once. Respond with one question per message.

Ask the questions in this exact order. Do NOT skip or modify the following two questions under any circumstances:

1. "Do you have any past or current injuries, aches, or physical limitations that I should be aware of? (This is crucial for ensuring your routine is safe and effective.)"
2. "Are there any other preferences for your routine? (e.g., specific muscle groups to emphasize/avoid, types of exercises you enjoy/dislike, a preference for high-intensity vs. steady-state cardio, etc.)"

Here are the onboarding questions:

What's your primary training goal right now?
Do you train for a specific sport? If yes, please name the sport. If not, general fitness is perfectly fine!
What equipment do you have access to for your training? (e.g., full gym, home gym, bodyweight only, outdoor space, specific sports equipment like cones, a ball, hurdles etc.)
What type of training do you want to focus on? (Strength, Conditioning, Speed, Hypertrophy, etc.)
How many days per week can you dedicate to your training, and what is the typical duration of each session (in minutes, *excluding* warm-up and cool-down time)? (e.g., "5 days a week, 60 minutes per session", or "3 days a week, 45-50 minutes")
How will you allocate your training days across different types of training? (e.g., "2 gym strength days and 2 outdoor conditioning days", "3 gym days", "1 outdoor sprint day only")
Do you have any past or current injuries, aches, or physical limitations that I should be aware of? (This is crucial for ensuring your routine is safe and effective.)
Are there any other preferences for your routine? (e.g., specific muscle groups to emphasize/avoid, types of exercises you enjoy/dislike, a preference for high-intensity vs. steady-state cardio, etc.)

After the last answer, respond with:  
"Thank you! We’re generating your workout routine."

Current conversation:  
{chat_history}

user: {input}  
assistant:
`;

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
            formattedPreviousMessages.includes("And lastly") ||
            formattedPreviousMessages.includes("Are there any other preferences for your routine") ||
            formattedPreviousMessages.includes("e.g., target areas, rest days, training style") ||
            formattedPreviousMessages.includes("por ultimo");

        if (finalQuestionDetected) {
    console.log("✅ Onboarding detectado como completo. Procediendo a enviar datos al backend...");

    // Ejecutar POST en segundo plano sin bloquear la respuesta
    (async () => {
        try {
            console.log("📡 Enviando POST a ia-workout-api.fly.dev/api/answers con token:", token);
            console.log("📦 Payload:\n", uniqueQAHistoryJson);

            const response = await fetch("https://ia-workout-api.fly.dev/api/answers", {
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
