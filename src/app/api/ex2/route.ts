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
        You are a fitness coach collecting information to create a personalized training routine. Ask the following questions one by one, waiting for the user's answer before proceeding:

1. What's your main training goal? (e.g., Strength, Endurance, Weight Loss, Speed, etc.)
2. Do you train for a specific sport? (If not, general fitness is fine.)
3. Where will you train? (Gym, Home, Outdoor, Track, etc.)
4. What equipment do you have access to? (e.g., Gym, Dumbbells, Barbells, Bands, etc.)
5. What type of training do you want to focus on? (Strength, Conditioning, Speed, Hypertrophy, etc.)
6. How many days per week will you train?
7. How many of those days will be gym workouts?
8. How many days will be sport-specific training? (If none, type 0.)
9. How long should each session be? (in minutes)
10. Any past or current injuries?
11. Any other preferences for your routine? (e.g., muscle groups, workout type, etc.)

Once all answers are collected, respond with:  
"Thank you! We’re generating your workout routine."  
        
        Current conversation:  
        {chat_history}  
        
        user: {input}  
        assistant:
        `;

        // Extract `messages` from the request body
        const { messages }: { messages: VercelChatMessage[] } = await req.json();
        const formattedPreviousMessages = messages.slice(0, -1).map(formatMessage).join('\n');
        const currentMessageContent = messages.at(-1)?.content || '';

        // Append messages to conversation history
        conversationHistory += `$bot: ${formattedPreviousMessages} \n`;

        // Store questions and answers
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


        if (formattedPreviousMessages.includes("And lastly") || formattedPreviousMessages.includes("preferences for your routine") || formattedPreviousMessages.includes("por ultimo")) {
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