"use client";

import { Button, Input } from "@/components/ui";
import { useFormAction } from "@/components/use-form-action";
import { CopyText } from "../weekly-summary/copy-text";
import { invite, newLink, setActive, setRole, type LinkState, type RowState } from "./actions";

const selectClass = "h-10 rounded-lg border border-line bg-surface px-3 text-sm";

export const ROLE_WORDS = {
  owner: "Owner — everything, including team and settings",
  operator: "Operator — labels money, writes bills, matches payments",
  viewer: "Viewer — can look, can't change anything",
} as const;

function RoleSelect({ defaultValue, id }: { defaultValue: string; id: string }) {
  return (
    <select id={id} name="role" defaultValue={defaultValue} className={selectClass}>
      {Object.entries(ROLE_WORDS).map(([value, words]) => (
        <option key={value} value={value}>
          {words}
        </option>
      ))}
    </select>
  );
}

function ShareLink({ state }: { state: LinkState }) {
  if (!state.link) return null;
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-ground/60 p-3 text-sm">
      <p>
        Send this link to {state.name || "them"} yourself (WhatsApp or email). It works once, for a
        limited time. With it they choose a password and set up 2-step sign-in.
      </p>
      <code className="break-all text-xs">{state.link}</code>
      <CopyText text={state.link} label="Copy the link" />
    </div>
  );
}

export function InviteForm() {
  const [state, action, pending] = useFormAction<LinkState>(invite, {});
  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={action} className="flex flex-col gap-3">
        <div className="grid gap-3 md:grid-cols-2">
          <Input label="Name" name="name" id="invite-name" required />
          <Input label="Email" name="email" id="invite-email" type="email" required />
        </div>
        <label htmlFor="invite-role" className="flex flex-col gap-1.5 text-sm font-medium">
          What they can do
          <RoleSelect id="invite-role" defaultValue="viewer" />
        </label>
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? "Adding…" : "Add and make a sign-in link"}
        </Button>
      </form>
      {state.error ? <p className="text-sm text-problem">{state.error}</p> : null}
      <ShareLink state={state} />
    </div>
  );
}

export function MemberControls({
  id,
  role,
  active,
  joined,
}: {
  id: string;
  role: string;
  active: boolean;
  joined: boolean;
}) {
  const [roleState, roleAction, rolePending] = useFormAction<RowState>(setRole, {});
  const [activeState, activeAction, activePending] = useFormAction<RowState>(setActive, {});
  const [linkState, linkAction, linkPending] = useFormAction<LinkState>(newLink, {});
  const error = roleState.error ?? activeState.error ?? linkState.error;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        {active ? (
          <form onSubmit={roleAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={id} />
            <label htmlFor={`role-${id}`} className="sr-only">
              Role
            </label>
            <RoleSelect id={`role-${id}`} defaultValue={role} />
            <Button type="submit" variant="secondary" disabled={rolePending}>
              {rolePending ? "Saving…" : "Save role"}
            </Button>
          </form>
        ) : null}
        <form onSubmit={activeAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="active" value={String(!active)} />
          <Button type="submit" variant="secondary" disabled={activePending}>
            {active ? "Switch off" : "Switch back on"}
          </Button>
        </form>
        {active && !joined ? (
          <form onSubmit={linkAction}>
            <input type="hidden" name="id" value={id} />
            <Button type="submit" variant="secondary" disabled={linkPending}>
              Make a new sign-in link
            </Button>
          </form>
        ) : null}
      </div>
      {error ? <p className="text-sm text-problem">{error}</p> : null}
      <ShareLink state={linkState} />
    </div>
  );
}
