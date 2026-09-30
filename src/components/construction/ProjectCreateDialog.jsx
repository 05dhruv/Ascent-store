"use client";

import { RequiredMark } from "@/components/ui/FormField";

import { useState } from "react";
import { Modal } from "@/components/ui/WorkspaceUI";
import Button from "@/components/ui/Button";

const steps = [
  "Project Information",
  "Client & Budget",
  "Site Details",
  "Settings",
];

export default function ProjectCreateDialog({
  open,
  onClose,
  form,
  setForm,
  users,
  saving,
  errorMessage,
  submit,
  onNameChange,
  onCodeChange,
}) {
  const [step, setStep] = useState(0);
  const field = (
    key,
    label,
    type = "text",
    placeholder = "",
    required = false,
  ) => (
    <label>
      <span>
        {label}
        {required && <RequiredMark />}
      </span>
      <input
        type={type}
        required={required}
        placeholder={placeholder}
        value={form[key]}
        onChange={(event) => {
          const value = event.target.value;
          if (key === "name") onNameChange(value);
          else if (key === "projectCode") onCodeChange(value);
          else
            setForm((prev) => ({
              ...prev,
              [key]: key === "siteCode" ? value.toUpperCase() : value,
            }));
        }}
      />
    </label>
  );
  const moveTo = (next, node) => {
    if (next > step && !node.closest("form").reportValidity()) return;
    setStep(next);
  };
  return (
    <Modal
      open={open}
      busy={saving}
      onClose={onClose}
      title="Create New Project"
      subtitle="Set up project details and initialize its first site store."
    >
      <form
        onSubmit={(event) => {
          if (step < 3) {
            event.preventDefault();
            setStep(step + 1);
          } else submit(event);
        }}
      >
        <fieldset disabled={saving} className="project-wizard">
          <nav className="wizard-steps" aria-label="Project setup steps">
            {steps.map((label, index) => (
              <button
                key={label}
                type="button"
                aria-current={step === index ? "step" : undefined}
                onClick={(event) => moveTo(index, event.currentTarget)}
              >
                <span>{index + 1}</span>
                {label}
              </button>
            ))}
          </nav>
          <div className="wizard-content">
            <h3 className="mb-1 text-lg font-semibold">{steps[step]}</h3>
            <p className="mb-6 text-xs text-slate-500">
              Step {step + 1} of 4 ·{" "}
              {step === 0
                ? "Start with the construction project details."
                : step === 1
                  ? "Add the client, approved budget and key dates."
                  : step === 2
                    ? "Prepare the first site store for material movement."
                    : "Choose the project status and review your setup."}
            </p>
            <div className="wizard-fields">
              {step === 0 && (
                <>
                  {field(
                    "projectCode",
                    "Project Code",
                    "text",
                    "e.g. PRJ-001",
                    true,
                  )}
                  {field(
                    "name",
                    "Project Name",
                    "text",
                    "e.g. Skyline Residency Phase 2",
                    true,
                  )}
                  <div className="col-span-2">
                    {field(
                      "address",
                      "Project Location / Site Address",
                      "text",
                      "e.g. Sector 62, Noida",
                    )}
                  </div>
                </>
              )}
              {step === 1 && (
                <>
                  {field(
                    "clientName",
                    "Client / Developer",
                    "text",
                    "e.g. Apex Infra Corp",
                  )}
                  {field("budget", "Budget (₹)", "number", "e.g. 5000000")}
                  {field("startDate", "Start Date", "date")}
                  {field("expectedEndDate", "Expected Completion", "date")}
                </>
              )}
              {step === 2 && (
                <>
                  {field(
                    "siteName",
                    "Site Store Name",
                    "text",
                    "e.g. Noida Site Store",
                  )}
                  {field("siteCode", "Site Code", "text", "e.g. SITE-01")}
                  <div className="col-span-2">
                    {field(
                      "siteAddress",
                      "Site Store Address",
                      "text",
                      "Site delivery address",
                    )}
                  </div>
                  <label className="col-span-2">
                    <span>Site Engineer / In-Charge</span>
                    <select
                      value={form.siteEngineerId}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          siteEngineerId: event.target.value,
                        }))
                      }
                    >
                      <option value="">Assign later</option>
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name || user.email}{" "}
                          {user.role ? `(${user.role})` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="col-span-2 text-xs leading-5 text-slate-500">
                    The assigned engineer will receive live site store inventory
                    access.
                  </p>
                </>
              )}
              {step === 3 && (
                <>
                  <label className="col-span-2">
                    <span>Status</span>
                    <select
                      value={form.status}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          status: event.target.value,
                        }))
                      }
                    >
                      <option value="planning">Planning</option>
                      <option value="active">Active</option>
                      <option value="on_hold">On Hold</option>
                      <option value="completed">Completed</option>
                    </select>
                  </label>
                  <dl className="col-span-2 space-y-3 rounded-lg bg-slate-50 p-4 text-sm">
                    <div>
                      <dt className="text-xs text-slate-500">Project</dt>
                      <dd className="mt-1 font-semibold">
                        {form.projectCode} · {form.name}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Client</dt>
                      <dd>{form.clientName || "Direct / Self"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">
                        First Site Store
                      </dt>
                      <dd>{form.siteName || "Created automatically"}</dd>
                    </div>
                  </dl>
                  <p className="col-span-2 text-xs leading-5 text-slate-500">
                    A linked site store will be created with this project to
                    receive material transfers.
                  </p>
                </>
              )}
            </div>
            {errorMessage && (
              <p
                role="alert"
                className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700"
              >
                {errorMessage}
              </p>
            )}
            <footer className="wizard-footer">
              <Button variant="secondary" className="mr-auto" onClick={onClose}>
                Cancel
              </Button>
              {step > 0 && (
                <Button variant="secondary" onClick={() => setStep(step - 1)}>
                  Back
                </Button>
              )}
              <Button type="submit" variant="accent" loading={saving}>
                {saving
                  ? "Creating…"
                  : step === 3
                    ? "Create Project & Site Store"
                    : "Next →"}
              </Button>
            </footer>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
