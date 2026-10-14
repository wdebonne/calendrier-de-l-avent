"use client";

import { startTransition, useActionState, type FormEvent } from "react";

/**
 * Like useActionState, but submits through onSubmit instead of the `action` prop.
 * React 19 resets uncontrolled fields after an `action` submission, which wiped the
 * values the user had just saved; this keeps them in place.
 */
export function useFormAction<State>(action: (state: Awaited<State>, form: FormData) => State | Promise<State>, initial: Awaited<State>) {
  const [state, dispatch, pending] = useActionState(action, initial);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    startTransition(() => dispatch(form));
  };
  return [state, onSubmit, pending] as const;
}
