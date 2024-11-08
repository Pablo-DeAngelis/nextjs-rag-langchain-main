import {
    Message as VercelChatMessage,
    StreamingTextResponse,
    createStreamDataTransformer
} from 'ai';
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { HttpResponseOutputParser } from 'langchain/output_parsers';

export const dynamic = 'force-dynamic';

/**
 * Basic memory formatter that stringifies and passes
 * message history directly into the model.
 */
const formatMessage = (message: VercelChatMessage) => {
    return `${message.role}: ${message.content}`;
};

async function getQuestions() {
    const response = await fetch("https://ia-workout-api.fly.dev/api/questions");
    const data = await response.json();
    return data.questions.map((q: any) => q.question);
}

export async function POST(req: Request) {
    try {
        // Fetch questions from the external service
       //// const questions = await getQuestions();

       const TEMPLATE = `
       You are a wizard that generates training routines. Ask the user these questions before creating the routine:
       - Age
       - Weight
       - Current training level
       - How many days they plan to train
       - Time per session
       - Training goals
       
       Once you have all the necessary information, create a routine in JSON format with this structure:
       
       The routine should contain an array of days, where each day has:
       - A "day" field with the day number and focus of the workout.
       - An "exercises" field which is an array of exercises. Each exercise includes:
           - "name": the name of the exercise.
           - "sets": number of sets.
           - "duration_or_reps": duration or number of repetitions.
           - "rpe": rating of perceived exertion (RPE).
       
       Only provide the routine in this JSON format without any additional explanation.
       
       Current conversation:
       {chat_history}
       
       user: {input}
       assistant:
       `;


        // Extract `messages` from the request body
        const { messages } = await req.json();
        const formattedPreviousMessages = messages.slice(0, -1).map(formatMessage);
        const currentMessageContent = messages.at(-1).content;

        const prompt = PromptTemplate.fromTemplate(TEMPLATE);

        const model = new ChatOpenAI({
            apiKey: process.env.OPENAI_API_KEY!,
            model: 'ft:gpt-4o-mini-2024-07-18:personal:coach-connect:AJKDMw15',
            temperature: 0.8,
            verbose: true,
        });

        const parser = new HttpResponseOutputParser();

        const chain = prompt.pipe(model.bind({ stop: ["assistant"] })).pipe(parser);

        // Generate the response
        const stream = await chain.stream({
            chat_history: formattedPreviousMessages.join('\n'),
            input: currentMessageContent,
        });

        return new StreamingTextResponse(
            stream.pipeThrough(createStreamDataTransformer()),
        );

    } catch (e: any) {
        return Response.json({ error: e.message }, { status: e.status ?? 500 });
    }
}
