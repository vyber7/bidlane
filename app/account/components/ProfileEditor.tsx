"use client";

import { getApiErrorMessage } from "@/app/utils/api-error";

import axios from "axios";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";
import AuthorizedUploadButton from "@/app/components/AuthorizedUploadButton";
import useUnsavedChangesWarning from "@/app/hooks/useUnsavedChangesWarning";
import {
  FiCalendar,
  FiCamera,
  FiCheck,
  FiCheckCircle,
  FiEdit2,
  FiLoader,
  FiLock,
  FiMail,
  FiShield,
  FiUser,
  FiX,
} from "react-icons/fi";
import { logger } from "@/app/libs/logger";
import { profileSchema } from "@/app/schemas/account";
import { formatMonthYear } from "@/app/utils/format";

type ProfileUser = {
  name: string;
  email: string;
  image: string;
  createdAt: string;
  hasPassword: boolean;
};

const ProfileEditor = ({ user }: { user: ProfileUser }) => {
  const router = useRouter();
  const [saved, setSaved] = useState({ name: user.name, image: user.image });
  const [name, setName] = useState(user.name);
  const [image, setImage] = useState(user.image);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fieldError, setFieldError] = useState<{ field: "name" | "image"; message: string } | null>(null);
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");
  const editButton = useRef<HTMLButtonElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const photoField = useRef<HTMLDivElement>(null);
  const returnFocus = useRef(false);
  const busy = useRef(false);
  const nameError = fieldError?.field === "name" ? fieldError.message : "";
  const imageError = fieldError?.field === "image" ? fieldError.message : "";
  useUnsavedChangesWarning(editing && (name !== saved.name || image !== saved.image || uploading));

  useEffect(() => {
    if (editing) {
      nameInput.current?.focus();
    } else if (returnFocus.current) {
      returnFocus.current = false;
      editButton.current?.focus();
    }
  }, [editing]);

  useEffect(() => {
    if (fieldError?.field === "name") nameInput.current?.focus();
    if (fieldError?.field === "image") photoField.current?.focus();
  }, [fieldError]);

  const initials = (saved.name || user.email)
    .split(/\s|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  const cancel = () => {
    setName(saved.name);
    setImage(saved.image);
    setFieldError(null);
    setSaveError("");
    setEditing(false);
  };

  const changeImage = (nextImage: string) => {
    setImage(nextImage);
    if (imageError) setFieldError(null);
    setSaveError("");
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing || busy.current || uploading) return;
    setSaveError("");
    const result = profileSchema.safeParse({ name, image });
    if (!result.success) {
      const issue = result.error.issues[0];
      setFieldError({ field: issue.path[0] === "image" ? "image" : "name", message: issue.message });
      return;
    }
    const { name: cleanName, image: cleanImage } = result.data;

    busy.current = true;
    setSaving(true);
    setFieldError(null);
    try {
      await axios.patch("/api/account/profile", { name: cleanName, image: cleanImage });
      setSaved({ name: cleanName, image: cleanImage });
      setName(cleanName);
      setEditing(false);
      setNotice("Profile updated.");
      router.refresh();
    } catch (error) {
      logger.error("account.profile_update_client_failed", error);
      setSaveError(getApiErrorMessage(error, "Couldn’t update your profile"));
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-5 py-5 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-gray-500">
              Personal details
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-gray-950">Profile</h2>
            <p className="mt-1 text-sm text-gray-500">
              Keep your public name and profile photo up to date.
            </p>
          </div>
          {!editing && (
            <button
              type="button"
              ref={editButton}
              onClick={() => {
                returnFocus.current = true;
                setNotice("");
                setEditing(true);
              }}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-bold text-gray-800 transition-colors hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
            >
              <FiEdit2 aria-hidden="true" /> Edit Profile
            </button>
          )}
        </div>
        <p role="status" className={notice ? "mt-3 text-sm text-emerald-800" : "sr-only"}>{notice}</p>
      </div>

      <form onSubmit={submit}>
        <div className="grid gap-8 p-5 sm:p-6 md:grid-cols-[180px_minmax(0,1fr)]">
          <div ref={photoField} role="group" aria-labelledby="profile-photo-label" aria-describedby={imageError ? "profile-photo-error" : undefined} tabIndex={-1} className="scroll-mt-[calc(var(--site-header-height)+1rem)]">
            <p id="profile-photo-label" className="mb-3 text-sm font-bold text-gray-900">Profile photo</p>
            <div className="relative h-32 w-32 overflow-hidden rounded-2xl bg-gradient-to-br from-gray-800 to-gray-950 shadow-sm ring-4 ring-gray-100">
              {image ? (
                <Image
                  src={image}
                  alt={`${name || "User"}'s profile`}
                  fill
                  unoptimized
                  sizes="128px"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-3xl font-bold text-white">
                  <span aria-hidden="true">{initials || <FiUser />}</span>
                </div>
              )}
            </div>
            {editing && (
              <div className="mt-4 flex flex-col items-start gap-2">
                <AuthorizedUploadButton
                  kind="PROFILE"
                  disabled={saving}
                  onUpload={changeImage}
                  onUploadingChange={setUploading}
                  className="inline-flex items-center gap-2 text-sm font-bold text-gray-900 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 disabled:opacity-50"
                >
                  <FiCamera aria-hidden="true" /> {image ? "Change Photo" : "Add Photo"}
                </AuthorizedUploadButton>
                {image && (
                  <button
                    type="button"
                    onClick={() => changeImage("")}
                    disabled={saving || uploading}
                    className="text-xs font-semibold text-gray-500 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 disabled:opacity-50"
                  >
                    Remove Photo
                  </button>
                )}
                {imageError && <p id="profile-photo-error" role="alert" className="text-sm text-rose-700">{imageError} Choose another photo or remove it.</p>}
              </div>
            )}
          </div>

          <div className="min-w-0 space-y-5">
            <Field icon={<FiUser />} label="Full name" htmlFor={editing ? "profile-name" : undefined}>
              {editing ? (
                <>
                  <input
                    ref={nameInput}
                    id="profile-name"
                    name="name"
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                      if (nameError) setFieldError(null);
                      setSaveError("");
                    }}
                    maxLength={60}
                    autoComplete="name"
                    readOnly={saving}
                    aria-invalid={Boolean(nameError)}
                    aria-describedby={nameError ? "profile-name-error" : undefined}
                    className="mt-1.5 block w-full rounded-lg border-gray-300 text-sm text-gray-950 shadow-sm focus-visible:border-gray-900 focus-visible:ring-gray-900 aria-[invalid=true]:border-rose-600"
                  />
                  {nameError && <p id="profile-name-error" role="alert" className="mt-1 text-sm text-rose-700">{nameError}</p>}
                </>
              ) : (
                <p className="mt-1 break-words font-semibold text-gray-950">{saved.name || "Not provided"}</p>
              )}
            </Field>

            <Field icon={<FiMail />} label="Email address">
              <p className="mt-1 break-all font-semibold text-gray-950">{user.email || "Not provided"}</p>
              <p className="mt-1 text-xs text-gray-500">Your sign-in email can’t be changed here.</p>
            </Field>

            <div className="grid gap-4 border-t border-gray-100 pt-5 sm:grid-cols-2">
              <Detail
                icon={<FiCalendar />}
                label="Member since"
                value={formatMonthYear(user.createdAt)}
              />
              <Detail
                icon={<FiLock />}
                label="Sign-in method"
                value={user.hasPassword ? "Email & password" : "Connected account"}
              />
            </div>
          </div>
        </div>

        {saveError && <p role="alert" className="px-5 pb-4 text-sm text-rose-700 sm:px-6">{saveError.replace(/\.$/, "")}. Review your changes and try again.</p>}
        {editing && (
          <div className="flex flex-col-reverse gap-3 border-t border-gray-200 bg-gray-50 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
            <button
              type="button"
              onClick={cancel}
              disabled={saving || uploading}
              className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 disabled:opacity-50"
            >
              <FiX aria-hidden="true" /> Cancel
            </button>
            <button
              type="submit"
              disabled={saving || uploading}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-950 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <><FiLoader aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> Saving…</> : <><FiCheck aria-hidden="true" /> Save Changes</>}
            </button>
          </div>
        )}
      </form>

      <div className="grid gap-px border-t border-gray-200 bg-gray-200 sm:grid-cols-2">
        <div className="flex gap-3 bg-white px-5 py-5 sm:px-6">
          <FiShield aria-hidden="true" className="mt-0.5 shrink-0 text-lg text-emerald-600" />
          <div>
            <p className="text-sm font-bold text-gray-950">Account protected</p>
            <p className="mt-1 text-xs leading-5 text-gray-500">
              Your profile details are only updated after an authenticated request.
            </p>
          </div>
        </div>
        <div className="flex gap-3 bg-white px-5 py-5 sm:px-6">
          <FiCheckCircle aria-hidden="true" className="mt-0.5 shrink-0 text-lg text-emerald-600" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-950">Primary email</p>
            <p className="mt-1 text-xs leading-5 text-gray-500">
              {user.email ? <>Auction updates and account notices go to <span className="break-all">{user.email}</span>.</> : "No primary email on file."}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

const Field = ({ icon, label, htmlFor, children }: { icon: React.ReactNode; label: string; htmlFor?: string; children: React.ReactNode }) => {
  const Caption = htmlFor ? "label" : "span";
  return (
    <div>
      <Caption htmlFor={htmlFor} className="flex items-center gap-2 text-sm font-bold text-gray-600">
        <span aria-hidden="true" className="text-gray-400">{icon}</span> {label}
      </Caption>
      {children}
    </div>
  );
};

const Detail = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
  <div className="flex items-start gap-3">
    <span aria-hidden="true" className="mt-0.5 text-gray-400">{icon}</span>
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-gray-900">{value}</p>
    </div>
  </div>
);

export default ProfileEditor;
