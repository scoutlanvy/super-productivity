// Standalone Electron document, outside Angular's component tree.
(() => {
  const api = (
    window as unknown as {
      quickAdd: {
        onOpen: (
          listener: (labels: { placeholder: string; error: string }) => void,
        ) => void;
        submit: (title: string) => Promise<boolean>;
        close: () => void;
      };
    }
  ).quickAdd;
  const input = document.querySelector('input')!;
  const form = document.querySelector('form')!;
  const error = document.querySelector('[role="alert"]')!;
  let errorLabel = '';
  let pending = false;
  api.onOpen((labels) => {
    input.placeholder = labels.placeholder;
    input.setAttribute('aria-label', labels.placeholder);
    errorLabel = labels.error;
    input.focus();
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (pending || !input.value.trim()) return;
    pending = true;
    input.disabled = true;
    try {
      if (await api.submit(input.value)) {
        api.close();
        return;
      }
    } catch {
      // Keep the draft visible when the app could not accept it.
    }
    error.textContent = errorLabel;
    input.disabled = false;
    pending = false;
    input.focus();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !pending) api.close();
  });
})();
