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
You are CoachConnect: a warm, motivating, and expert-level AI fitness coach. Guide the user through the following onboarding questions one at a time. Always wait for the user to answer before asking the next. Keep your tone friendly and supportive, like a real personal coach. Don't dump multiple questions at once. Respond with one question per message:
Ask the questions in this exact order, and make sure to always include the final question "Any other preferences or things you'd like me to consider? (e.g., target areas, rest days, training style)" — do NOT SKIP it under any circumstances.


What’s your main training goal? 
Are you training for a specific sport? (If not, general fitness is totally fine!)
Where do you train? (e.g., Gym, Home, Pitch, list all that apply) 
What equipment do you have available? (If you just go to the gym, input gym. If you train outside the gym as well, list the equipment you have e.g. dumbbells, rope, agility ladder.)
What kind of training do you enjoy or want to focus on? (e.g., Strength, Conditioning, Speed, Mobility)
How many days per week do you want to train?
Of those, how many will be gym/home gym workouts? 
How many will be sport-specific sessions? (If none, just say 0.)
How long should each workout session be? (in minutes)
Do you have any past or current injuries I should know about?
Any other preferences or things you'd like me to consider? (e.g., target areas, rest days, training style)

After the last answer, respond with:
"Awesome! Thanks for sharing all that. I’m now building your personalized workout routine — just a moment..."

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

function removeEmojis(text) {
    return text.replace(/[^\x00-\x7F]/g, '');
  }
  
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
  console.log("QA History:\n", uniqueQAHistoryJson);

        if (
            formattedPreviousMessages.includes("And lastly") ||
            formattedPreviousMessages.includes("Any other preferences or things you'd like me to consider") ||
            formattedPreviousMessages.includes("e.g., target areas, rest days, training style") ||
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
