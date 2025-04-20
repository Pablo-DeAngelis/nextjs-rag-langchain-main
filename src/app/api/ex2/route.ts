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
    try {
        const token = req.headers.get('Authorization')?.replace('Bearer ', '');
        console.log("Received Token:", token);

        const TEMPLATE = `
You are a fitness coach collecting information to create a personalized training routine. Ask the following questions one by one, waiting for the user's answer before proceeding:

What's your main training goal?
Do you train for a specific sport? (If not, general fitness is fine.)
What equipment do you have access to? (If you just go to the gym, input gym. If you train outside the gym as well, list the equipment you have e.g. dumbbells, rope, agility ladder.)
What equipment do you have access to? (e.g., Gym, Dumbbells, Barbells, Bands, etc.)
What type of training do you want to focus on? (Strength, Conditioning, Speed, Hypertrophy, etc.)
How many days per week will you train?
How many of those days will be gym workouts?
How many days will be sport-specific training? (If none, type 0.)
How long should each session be? (in minutes)
Any past or current injuries?
Any other preferences for your routine? (e.g., muscle groups, workout type, etc.)

Once all answers are collected, respond with:  
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
            model: 'ft:gpt-4o-2024-08-06:personal:coach-connect:B6jTRMtL',
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

        const uniqueQAHistory = qaHistory.filter((value, index, self) =>
            index === self.findIndex((t) =>
                t.question === value.question && t.answer === value.answer
            )
        );

        const uniqueQAHistoryJson = JSON.stringify(uniqueQAHistory, null, 2);
        console.log("QA History:\n", uniqueQAHistoryJson);

        if (
            formattedPreviousMessages.includes("And lastly") ||
            formattedPreviousMessages.includes("preferences for your routine") ||
            formattedPreviousMessages.includes("e.g., muscle groups, workout type, etc.") ||
            formattedPreviousMessages.includes("por ultimo")
        ) {
            // Ejecutar POST en segundo plano sin bloquear la respuesta
            (async () => {
                try {
                    const response = await fetch("https://ia-workout-api.fly.dev/api/answers", {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: uniqueQAHistoryJson
                    });

                    const responseData = await response.json();
                    console.log("Response from external service:", responseData);
                } catch (error) {
                    console.error("Error sending data to external service:", error);
                }
            })();
        }

        return finalResponse;

    } catch (e: any) {
        return Response.json({ error: e.message }, { status: e.status ?? 500 });
    }
}
