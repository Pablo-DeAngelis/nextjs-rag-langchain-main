'use client'

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useChat } from "ai/react";
import { useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";

export function Chat() {
    const searchParams = useSearchParams();
    const token = searchParams.get("token");

    const { messages, input, handleInputChange, handleSubmit, setMessages } = useChat({
        api: "api/ex2",
        headers: {
            Authorization: `Bearer ${token}`,
        },
        onError: (e) => {
            console.log(e);
        },
    });

    const chatParent = useRef<HTMLUListElement>(null);

    useEffect(() => {
        const domNode = chatParent.current;
        if (domNode) {
            domNode.scrollTop = domNode.scrollHeight;
        }

        setMessages([
            { id: "bot-1", role: "assistant", content: "Hello! I’m a training assistant. What is your fitness level? (Beginner, Intermediate, Advanced)" },
            ...messages,
        ]);
    }, []);

    return (
        <main className="flex flex-col w-full h-screen bg-gray-100">

            <section className="text-center py-4">
                <h2 className="text-purple-600 font-semibold text-sm"></h2>
                <h1 className="text-2xl font-bold text-gray-800">COACH CONNECT</h1>
            </section>

            <section className="flex flex-col flex-grow max-w-3xl mx-auto px-4">
                <ul ref={chatParent} className="flex-grow overflow-y-auto space-y-4">
                    {messages.map((m, index) => (
                        <li key={index} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                            <div className={`p-4 rounded-xl shadow-md max-w-[75%] ${m.role === "user" ? "bg-purple-500 text-white" : "bg-white text-gray-900"}`}>
                                <p>{m.content}</p>
                            </div>
                        </li>
                    ))}
                </ul>
            </section>

            <section className="p-4 w-full max-w-3xl mx-auto">
                <form onSubmit={handleSubmit} className="flex w-full items-center bg-white p-2 rounded-xl shadow-md">
                    <Input className="flex-1 border-none focus:ring-0" placeholder="Type your response..." type="text" value={input} onChange={handleInputChange} />
                    <Button className="ml-2 bg-purple-500 text-white px-4 py-2 rounded-lg">Send</Button>
                </form>
            </section>
        </main>
    );
}