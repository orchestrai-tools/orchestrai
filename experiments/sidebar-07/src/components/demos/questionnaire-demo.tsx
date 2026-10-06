import { useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Questionnaire,
  QuestionnaireActions,
  QuestionnaireChoice,
  QuestionnaireChoiceDescription,
  QuestionnaireChoices,
  QuestionnaireDescription,
  QuestionnaireError,
  QuestionnaireInput,
  QuestionnaireItem,
  QuestionnaireNext,
  QuestionnairePrevious,
  QuestionnaireProgress,
  QuestionnaireSkip,
  QuestionnaireSubmit,
  QuestionnaireTitle,
} from "@/components/ui/questionnaire"

/** Single choice with a freeform answer, an optional multi-select, and a required single choice. */
const items = [
  {
    name: "direction",
    required: true,
    multiple: false,
    prompt: "What should the agent build next?",
    description: "Choose a direction or describe another task.",
    choices: [
      { value: "scroller", label: "Chat scroller", description: "Stream replies without jumping." },
      { value: "questions", label: "Question prompts", description: "Ask while the interface waits." },
      { value: "both", label: "Both together" },
    ],
    input: { label: "Another task", placeholder: "Describe another task…" },
  },
  {
    name: "updates",
    required: false,
    multiple: true,
    prompt: "What should every progress update include?",
    description: "Select all that apply, or skip this question.",
    choices: [
      { value: "summary", label: "A short summary" },
      { value: "files", label: "Files changed" },
      { value: "tests", label: "Test results" },
    ],
  },
  {
    name: "start",
    required: true,
    multiple: false,
    prompt: "When should work begin?",
    description: "Choose when the agent should begin the work.",
    choices: [
      { value: "now", label: "Right away" },
      { value: "review", label: "After I review the plan" },
    ],
  },
] as const

/** Questionnaire in a card; on submit it shows the collected answers. */
export function QuestionnaireDemo() {
  const [answers, setAnswers] = useState<[string, string][] | null>(null)
  const [run, setRun] = useState(0)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setAnswers(
      items.map((item) => [item.prompt, data.getAll(item.name).filter(Boolean).join(", ") || "Skipped"])
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Questionnaire</CardTitle>
        <CardDescription>Single choice with a freeform answer, an optional multi-select, and a skip.</CardDescription>
      </CardHeader>
      <CardContent>
        {answers ? (
          <div className="flex flex-col gap-4">
            <dl className="flex flex-col gap-3">
              {answers.map(([prompt, value]) => (
                <div key={prompt}>
                  <dt className="text-muted-foreground">{prompt}</dt>
                  <dd className="font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            <Button
              variant="outline"
              className="self-start"
              onClick={() => {
                setAnswers(null)
                setRun((value) => value + 1)
              }}
            >
              Start over
            </Button>
          </div>
        ) : (
          <Questionnaire key={run} items={items} onSubmit={handleSubmit}>
            <QuestionnaireProgress />
            {items.map((item) => (
              <QuestionnaireItem
                key={item.name}
                name={item.name}
                required={item.required}
                multiple={item.multiple}
              >
                <QuestionnaireTitle>{item.prompt}</QuestionnaireTitle>
                <QuestionnaireDescription>{item.description}</QuestionnaireDescription>
                <QuestionnaireChoices>
                  {item.choices.map((choice) => (
                    <QuestionnaireChoice key={choice.value} value={choice.value}>
                      <span className="font-medium">{choice.label}</span>
                      {"description" in choice && (
                        <QuestionnaireChoiceDescription>{choice.description}</QuestionnaireChoiceDescription>
                      )}
                    </QuestionnaireChoice>
                  ))}
                  {"input" in item && (
                    <QuestionnaireInput aria-label={item.input.label} placeholder={item.input.placeholder} />
                  )}
                </QuestionnaireChoices>
                <QuestionnaireError />
              </QuestionnaireItem>
            ))}
            <QuestionnaireActions>
              <QuestionnairePrevious />
              <QuestionnaireSkip />
              <QuestionnaireNext />
              <QuestionnaireSubmit />
            </QuestionnaireActions>
          </Questionnaire>
        )}
      </CardContent>
    </Card>
  )
}
