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
        
        1. **Fitness Level:**  
           What is your fitness level? (Beginner, Intermediate, Advanced)  
        
        2. **Goal:**  
           What is your main goal for training? (e.g., Improve athletic performance, build strength, increase endurance, lose weight, enhance speed, etc.)  
        
        3. **Sport Focus (If Applicable):**  
           What sport do you train for, if any? (e.g., basketball, football, soccer, etc.)  
           (If no specific sport, we can focus on general fitness goals.)  
        
        4. **Workout Frequency:**  
           How many days per week do you want to train?  
        
        5. **Session Duration:**  
           How long do you want each training session to be? (in minutes)  
        
        6. **Routine Focus:**  
           On which type of training do you want to focus? (e.g., Strength, Conditioning, Explosiveness, Speed, Endurance, Hypertrophy, Power, Agility, etc.)  
        
        7. **Equipment:**  
           What equipment do you have access to? (e.g., gym, dumbbells, barbells, resistance bands, cones, agility ladder, etc.)  
        
        8. **Gym Days (If Applicable):**  
           How many days per week will you train at the gym?  
        
        9. **Sport-Specific Days (If Applicable):**  
           How many days per week will you do sport-specific drills or conditioning? (e.g., on a pitch, track, or other sport-related drills)  
        
        10. **Specific Gym Focus (If Applicable):**  
            On gym days, would you like to focus on any of the following?  
            (You can select multiple: Strength, Power, Explosiveness, Endurance, Hypertrophy, Mobility, Agility, Core Strength, etc.)  
        
        11. **Rest Periods:**  
            What is your preferred rest period between sets? (e.g., 30 seconds, 60 seconds, 90 seconds, etc.)  
        
        12. **Training Environment (Location):**  
            What type of environment will you mostly train in? (e.g., gym, home gym, outdoor, football pitch, track, etc.)  
        
        13. **Injury History:**  
            Do you have any past injuries or current injuries that should be considered?  
        
        14. **Other Considerations:**  
            And lastly, do you have any other preferences or considerations you'd like to share for your training program? (e.g., focus on mobility, stress management, muscle groups, etc.)  
        
        Once you have all the answers, respond only with:  
        "Thank you very much! We’re going to generate your workout routine."  
        
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
if (formattedPreviousMessages.includes("And lastly") || formattedPreviousMessages.includes("por ultimo")) {
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
