import type { DetailFormDraft, PathStatusStepDraft } from './detail-form.types'

type PathStatusEditorProps = {
  value: DetailFormDraft
  availableFields: string[]
  onChange: (value: DetailFormDraft) => void
}

export function PathStatusEditor({
  value,
  availableFields,
  onChange,
}: PathStatusEditorProps) {
  const fieldListId = 'detail-path-status-field-options'

  const update = (patch: Partial<DetailFormDraft>) => {
    onChange({
      ...value,
      ...patch,
    })
  }

  const updateStep = (index: number, patch: Partial<PathStatusStepDraft>) => {
    update({
      pathStatusSteps: value.pathStatusSteps.map((step, currentIndex) =>
        currentIndex === index ? { ...step, ...patch } : step,
      ),
    })
  }

  const addStep = () => {
    update({
      pathStatusSteps: [...value.pathStatusSteps, createEmptyPathStatusStepDraft()],
    })
  }

  const removeStep = (index: number) => {
    update({
      pathStatusSteps: value.pathStatusSteps.filter(
        (_, currentIndex) => currentIndex !== index,
      ),
    })
  }

  return (
    <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <legend className="px-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        Path Status
      </legend>

      <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
        <input
          type="checkbox"
          checked={value.pathStatusEnabled}
          onChange={(event) => update({ pathStatusEnabled: event.target.checked })}
          className="h-4 w-4 rounded border border-slate-300 text-sky-600 focus:ring-sky-200"
        />
        Abilita Path Status
      </label>

      {value.pathStatusEnabled ? (
        <div className="mt-4 space-y-4">
          {availableFields.length > 0 ? (
            <datalist id={fieldListId}>
              {availableFields.map((field) => (
                <option key={field} value={field} />
              ))}
            </datalist>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              Field
              <input
                list={fieldListId}
                type="text"
                value={value.pathStatusField}
                onChange={(event) => update({ pathStatusField: event.target.value })}
                placeholder="es. StageName"
                className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              />
            </label>

            <label className="inline-flex items-center gap-2 self-end text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={value.pathStatusAllowUpdate}
                onChange={(event) => update({ pathStatusAllowUpdate: event.target.checked })}
                className="h-4 w-4 rounded border border-slate-300 text-sky-600 focus:ring-sky-200"
              />
              Consenti update dello status
            </label>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Steps
                </p>
                <p className="text-xs text-slate-500">Ogni step richiede almeno `value`.</p>
              </div>
              <button
                type="button"
                onClick={addStep}
                className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
              >
                Aggiungi Step
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {value.pathStatusSteps.map((step, index) => (
                <div
                  key={`path-status-step-${index}`}
                  className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                >
                  <label className="text-xs font-medium text-slate-600">
                    Value
                    <input
                      type="text"
                      value={step.value}
                      onChange={(event) => updateStep(index, { value: event.target.value })}
                      className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                    />
                  </label>

                  <label className="text-xs font-medium text-slate-600">
                    Label
                    <input
                      type="text"
                      value={step.label}
                      onChange={(event) => updateStep(index, { label: event.target.value })}
                      className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => removeStep(index)}
                    className="self-end rounded-md border border-rose-300 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-rose-700 transition hover:border-rose-400 hover:bg-rose-50"
                  >
                    Remove
                  </button>
                </div>
              ))}

              {value.pathStatusSteps.length === 0 ? (
                <p className="text-xs text-slate-400">Nessuno step configurato.</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </fieldset>
  )
}

function createEmptyPathStatusStepDraft(): PathStatusStepDraft {
  return {
    value: '',
    label: '',
  }
}
