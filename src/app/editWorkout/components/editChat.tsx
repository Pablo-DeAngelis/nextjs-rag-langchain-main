'use client'

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useChat } from "ai/react";
import { useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";

export function EditChat() {
    const searchParams = useSearchParams();
    const token = searchParams.get("token");

    const {
        messages,
        input,
        handleInputChange,
        handleSubmit,
        setMessages
    } = useChat({
        api: "editWorkout/api/edit",
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
            setTimeout(() => {
                domNode.scrollTop = domNode.scrollHeight;
            }, 100);
        }
    }, [messages]);

    useEffect(() => {
        const handleResize = () => {
            const domNode = chatParent.current;
            if (domNode) {
                setTimeout(() => {
                    domNode.scrollTop = domNode.scrollHeight;
                }, 100);
            }
        };

        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    useEffect(() => {
        setMessages([
            {
                id: "bot-1",
                role: "assistant",
                content:
                    "Hi! I’m CoachConnect — your personal AI fitness coach. 💪\n\nLet’s fine-tune your current training plan so it fits you even better.\n\nIs there anything you’d like me to change or adjust in your routine? (e.g., focus areas, number of sessions, intensity)",
            },
            ...messages,
        ]);
    }, []);

    return (
        <main className="flex flex-col w-full h-[100dvh] bg-gray-100">

            <section className="flex flex-col flex-grow max-w-3xl mx-auto px-4 overflow-hidden">
                <ul
                    ref={chatParent}
                    className="flex-grow overflow-y-auto space-y-4 p-4"
                >
                    {messages.map((m, index) => (
                        <li
                            key={index}
                            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                        >
                            <div
                                className={`p-4 rounded-xl shadow-md max-w-[75%] ${
                                    m.role === "user"
                                        ? "bg-[#3A86FF] text-white"
                                        : "bg-white text-gray-900"
                                }`}
                            >
                                <p>
                                    {m.content.split('\n').map((line, i) => (
                                        <span key={i}>
                                            {line}
                                            <br />
                                        </span>
                                    ))}
                                </p>
                            </div>
                        </li>
                    ))}
                </ul>
            </section>

            <section className="p-4 w-full max-w-3xl mx-auto mb-4">
                <form
                    onSubmit={handleSubmit}
                    className="flex w-full items-center bg-white p-2 rounded-xl shadow-md"
                >
                    <Input
                        className="flex-1 border-none focus:ring-0 text-base"
                        placeholder="Type your response..."
                        type="text"
                        inputMode="text"
                        value={input}
                        onChange={handleInputChange}
                    />
                    <Button className="ml-2 bg-[#3A86FF] text-white px-4 py-2 rounded-lg">
                        Send
                    </Button>
                </form>
            </section>
        </main>
    );
}
