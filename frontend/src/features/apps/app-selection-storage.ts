const APP_SELECTION_STORAGE_KEY = 'sfdc-external.selected-app'

export type StoredAppSelection = {
  userSub: string
  appId: string
}

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && 'localStorage' in window
}

export function readStoredAppSelection(): StoredAppSelection | null {
  if (!canUseLocalStorage()) {
    return null
  }

  try {
    const rawValue = window.localStorage.getItem(APP_SELECTION_STORAGE_KEY)
    if (!rawValue) {
      return null
    }

    const parsed = JSON.parse(rawValue) as Partial<StoredAppSelection>
    if (
      typeof parsed.userSub !== 'string' ||
      parsed.userSub.trim().length === 0 ||
      typeof parsed.appId !== 'string' ||
      parsed.appId.trim().length === 0
    ) {
      return null
    }

    return {
      userSub: parsed.userSub,
      appId: parsed.appId,
    }
  } catch {
    return null
  }
}

export function writeStoredAppSelection(selection: StoredAppSelection): void {
  if (!canUseLocalStorage()) {
    return
  }

  try {
    window.localStorage.setItem(APP_SELECTION_STORAGE_KEY, JSON.stringify(selection))
  } catch {
    // Ignore storage write failures and keep the in-memory selection.
  }
}

export function clearStoredAppSelection(): void {
  if (!canUseLocalStorage()) {
    return
  }

  try {
    window.localStorage.removeItem(APP_SELECTION_STORAGE_KEY)
  } catch {
    // Ignore storage cleanup failures.
  }
}

