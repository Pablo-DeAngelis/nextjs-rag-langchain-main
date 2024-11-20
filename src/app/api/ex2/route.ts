import {
    Message as VercelChatMessage,
    StreamingTextResponse,
    createStreamDataTransformer
} from 'ai';
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { HttpResponseOutputParser } from 'langchain/output_parsers';

export const dynamic = 'force-dynamic';

// Variable to accumulate conversation history
let conversationHistory = '';

// Variable to store questions and answers
let qaHistory: { question: string, answer: string }[] = [];

const formatMessage = (message: VercelChatMessage) => {
    return `${message.role}: ${message.content}`;
};

export async function POST(req: Request) {
    try {
        // Extract the token from the headers
        const token = req.headers.get('Authorization')?.replace('Bearer ', '');

        // Log the token for verification
        console.log("Received Token:", token);

        const TEMPLATE = `
        You are a coach that collects information to create a training routine for the user. Ask the user the following questions one at a time and wait for their answer before proceeding to the next question:
        - Age
        - Weight
        - Current training level (with options)
        - How many days they plan to train
        - Time per session
        - Training goals (with options)
        
        Once you have all the answers, respond only with:
        "Muchas gracias, vamos a generarte la rutina."
        
        Current conversation:
        {chat_history}
        
        user: {input}
        assistant:
        `;

        // Extract `messages` from the request body
        const { messages } = await req.json();
        const formattedPreviousMessages = messages.slice(0, -1).map(formatMessage).join('\n');
        const currentMessageContent = messages.at(-1).content;

        // Append messages to conversation history
        conversationHistory += `$bot: ${formattedPreviousMessages} \n`;

        // Store questions and answers
        messages.slice(0, -1).forEach((message, index) => {
            if (index % 2 === 0) {
                qaHistory.push({ question: message.content, answer: messages[index + 1]?.content || '' });
            }
        });

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
            chat_history: formattedPreviousMessages,
            input: currentMessageContent,
        });
        
        const finalResponse = new StreamingTextResponse(
            stream.pipeThrough(createStreamDataTransformer()),
        );


        const uniqueQAHistory = qaHistory.filter((value, index, self) =>
            index === self.findIndex((t) => (
              t.question === value.question && t.answer === value.answer
            ))
          );

        const uniqueQAHistoryJson = JSON.stringify(uniqueQAHistory, null, 2);

        // Log QA History for debugging
        console.log("QA History:\n", uniqueQAHistoryJson);

        // Check if the response is the thank you message
        if (formattedPreviousMessages.includes("Muchas gracias, vamos a generarte la rutina.")) {
            // Perform POST request to the external service
            const response = await fetch("https://ia-workout-api.fly.dev/api/answers", {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: uniqueQAHistoryJson
            });

            // Log the response from the external service
            const responseData = await response.json();
            console.log("Response from external service:", responseData);
        }

        return finalResponse;

    } catch (e: any) {
        return Response.json({ error: e.message }, { status: e.status ?? 500 });
    }
}