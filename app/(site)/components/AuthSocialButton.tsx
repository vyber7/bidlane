import { IconType } from "react-icons";

interface AuthSocialButtonProps {
  icon: IconType;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}

export default function AuthSocialButton({ icon: Icon, label, disabled, onClick }: AuthSocialButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 disabled:cursor-wait disabled:opacity-60"
    >
      <Icon aria-hidden="true" size={17} />
      {label}
    </button>
  );
}
