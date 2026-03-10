import { component$, For, useSignal } from "eclipsa";
import { Header } from "./Header.tsx";

export default component$(() => {
  const todos = useSignal<string[]>(["ToDo1"]);
  const inputting = useSignal("");

  return (
    <div>
      <Header />
      <input
        onInput$={(e: InputEvent) => {
          inputting.value = (e.currentTarget as HTMLInputElement).value;
        }}
        value={inputting.value}
      />
      <button
        onClick$={() => {
          todos.value = [...todos.value, inputting.value];
          inputting.value = "";
        }}
      >
        Addaaaa
      </button>
      <ul>
        <For arr={todos.value} fn={(todo, i) => <li key={i}>{todo}</li>} />
      </ul>
    </div>
  );
});
