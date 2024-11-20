'use client'

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useChat } from "ai/react"
import { useRef, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'


export function Chat() {
    const searchParams = useSearchParams()
    const token = searchParams.get('token')

    const { messages, input, handleInputChange, handleSubmit, setMessages } = useChat({
        api: 'api/ex2',
        headers: {
            Authorization: `Bearer ${token}`
        },
        onError: (e) => {
            console.log(e)
        }
    })

    const chatParent = useRef<HTMLUListElement>(null)

    useEffect(() => {
        const domNode = chatParent.current
        if (domNode) {
            domNode.scrollTop = domNode.scrollHeight
        }

        // Agrega el primer mensaje del bot
        setMessages([
            { id: 'bot-1', role: 'assistant', content: 'Hola, soy un asistente de entrenamiento que necesita conocerte para armar la rutina. Primero necesito preguntarte cual es tu edad?' },
            ...messages
        ])
    }, [])

    return (
        <main className="flex flex-col w-full h-screen max-h-dvh bg-background">

            <header className="p-4 border-b w-full max-w-3xl mx-auto">
                <h1 className="text-2xl font-bold">Coach Connect</h1>
            </header>

            <section className="container px-0 pb-2 flex flex-col flex-grow gap-4 mx-auto max-w-3xl">
                <ul ref={chatParent} className="h-1 p-4 flex-grow bg-muted/50 rounded-lg overflow-y-auto flex flex-col gap-4">
                    {messages.map((m, index) => (
                        <div key={index}>
                            {m.role === 'user' ? (
                                <li key={m.id} className="flex flex-row-reverse">
                                    <div className="rounded-xl p-4 bg-background shadow-md flex w-3/4">
                                        <p className="text-primary">{m.content}</p>
                                    </div>
                                </li>
                            ) : (
                                <li key={m.id} className="flex flex-row">
                                    <div className="rounded-xl p-4 bg-muted shadow-md flex w-3/4">
                                        <p className="text-primary">{m.content}</p>
                                    </div>
                                </li>
                            )}
                        </div>
                    ))}
                </ul>
            </section>

            <section className="p-4 w-full max-w-3xl mx-auto">
                <form onSubmit={handleSubmit} className="flex w-full items-center">
                    <Input className="flex-1 min-h-[40px]" placeholder="Type your question here..." type="text" value={input} onChange={handleInputChange} />
                    <Button className="ml-2" type="submit">
                        Submit
                    </Button>
                </form>
            </section>
            
        </main>
    )
}
