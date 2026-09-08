import type { Id } from "../convex/_generated/dataModel";
import { NewJobForm } from "./pages/NewJobPage";

export function NewJobModal({
  projectId,
  onClose,
  onComplete,
}: {
  projectId: string;
  onClose: () => void;
  onComplete: (jobId: Id<"jobs">) => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="import-sheet new-job-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-job-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="import-head">
          <div>
            <h2 id="new-job-title">New job</h2>
            <p>Start a request in the selected Project and Workflow.</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <NewJobForm initialProjectId={projectId} onComplete={onComplete} lockProject />
      </section>
    </div>
  );
}
