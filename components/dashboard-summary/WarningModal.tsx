import { Modal } from "../common/Modal";

export function WarningModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} showCloseButton title="Withdraw is not enabled">
      <div className="mt-4 text-center text-sm text-gray-500">
        Withdraw is a production-only feature. For moving to production, please contact{" "}
        <a
          className="text-indigo-600"
          href="https://www.crossmint.com/contact/sales"
          target="_blank"
        >
          sales team
        </a>
        .
      </div>
    </Modal>
  );
}
