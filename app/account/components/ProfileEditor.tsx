"use client";

import axios from "axios";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import toast from "react-hot-toast";
import {
  CldUploadButton,
  type CloudinaryUploadWidgetResults,
} from "next-cloudinary";
import {
  FiCalendar,
  FiCamera,
  FiCheck,
  FiCheckCircle,
  FiEdit2,
  FiLock,
  FiMail,
  FiShield,
  FiUser,
  FiX,
} from "react-icons/fi";
import { logger } from "@/app/libs/logger";

type ProfileUser = {
  name: string;
  email: string;
  image: string;
  createdAt: string;
  hasPassword: boolean;
};

const memberSince = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
});

const ProfileEditor = ({ user }: { user: ProfileUser }) => {
  const router = useRouter();
  const [saved, setSaved] = useState({ name: user.name, image: user.image });
  const [name, setName] = useState(user.name);
  const [image, setImage] = useState(user.image);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const initials = (saved.name || user.email)
    .split(/\s|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  const cancel = () => {
    setName(saved.name);
    setImage(saved.image);
    setEditing(false);
  };

  const handleUpload = (result: CloudinaryUploadWidgetResults) => {
    if (typeof result.info === "object" && result.info.secure_url) {
      setImage(result.info.secure_url);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanName = name.trim();
    if (cleanName.length < 2) {
      toast.error("Please enter at least 2 characters for your name.");
      return;
    }

    setSaving(true);
    try {
      await axios.patch("/api/account/profile", { name: cleanName, image });
      setSaved({ name: cleanName, image });
      setName(cleanName);
      setEditing(false);
      toast.success("Profile updated.");
      router.refresh();
    } catch (error) {
      logger.error("account.profile_update_client_failed", error);
      toast.error("We couldn't update your profile. Please try again.");
    } finally {
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
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-gray-950">Your profile</h2>
            <p className="mt-1 text-sm text-gray-500">
              Keep your public name and profile photo up to date.
            </p>
          </div>
          {!editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-bold text-gray-800 transition hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
            >
              <FiEdit2 /> Edit profile
            </button>
          )}
        </div>
      </div>

      <form onSubmit={submit}>
        <div className="grid gap-8 p-5 sm:p-6 md:grid-cols-[180px_1fr]">
          <div>
            <p className="mb-3 text-sm font-bold text-gray-900">Profile photo</p>
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
                  {initials || <FiUser />}
                </div>
              )}
            </div>
            {editing && (
              <div className="mt-4 flex flex-col items-start gap-2">
                <CldUploadButton
                  options={{ maxFiles: 1, resourceType: "image", folder: "profile-images" }}
                  onSuccess={handleUpload}
                  uploadPreset="auctions"
                  className="inline-flex items-center gap-2 text-sm font-bold text-gray-900 hover:underline"
                >
                  <FiCamera /> {image ? "Change photo" : "Add photo"}
                </CldUploadButton>
                {image && (
                  <button
                    type="button"
                    onClick={() => setImage("")}
                    className="text-xs font-semibold text-gray-500 hover:text-gray-900"
                  >
                    Remove photo
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="space-y-5">
            <Field icon={<FiUser />} label="Full name">
              {editing ? (
                <input
                  id="profile-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={60}
                  autoComplete="name"
                  className="mt-1.5 block w-full rounded-lg border-gray-300 text-sm text-gray-950 shadow-sm focus:border-gray-900 focus:ring-gray-900"
                />
              ) : (
                <p className="mt-1 font-semibold text-gray-950">{saved.name || "Not provided"}</p>
              )}
            </Field>

            <Field icon={<FiMail />} label="Email address">
              <p className="mt-1 font-semibold text-gray-950">{user.email}</p>
              <p className="mt-1 text-xs text-gray-500">Your sign-in email can’t be changed here.</p>
            </Field>

            <div className="grid gap-4 border-t border-gray-100 pt-5 sm:grid-cols-2">
              <Detail
                icon={<FiCalendar />}
                label="Member since"
                value={memberSince.format(new Date(user.createdAt))}
              />
              <Detail
                icon={<FiLock />}
                label="Sign-in method"
                value={user.hasPassword ? "Email & password" : "Connected account"}
              />
            </div>
          </div>
        </div>

        {editing && (
          <div className="flex flex-col-reverse gap-3 border-t border-gray-200 bg-gray-50 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
            <button
              type="button"
              onClick={cancel}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-200 disabled:opacity-50"
            >
              <FiX /> Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-950 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving…" : <><FiCheck /> Save changes</>}
            </button>
          </div>
        )}
      </form>

      <div className="grid gap-px border-t border-gray-200 bg-gray-200 sm:grid-cols-2">
        <div className="flex gap-3 bg-white px-5 py-5 sm:px-6">
          <FiShield className="mt-0.5 shrink-0 text-lg text-emerald-600" />
          <div>
            <p className="text-sm font-bold text-gray-950">Account protected</p>
            <p className="mt-1 text-xs leading-5 text-gray-500">
              Your profile details are only updated after an authenticated request.
            </p>
          </div>
        </div>
        <div className="flex gap-3 bg-white px-5 py-5 sm:px-6">
          <FiCheckCircle className="mt-0.5 shrink-0 text-lg text-emerald-600" />
          <div>
            <p className="text-sm font-bold text-gray-950">Primary email</p>
            <p className="mt-1 text-xs leading-5 text-gray-500">
              Auction updates and account notices go to {user.email}.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

const Field = ({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) => (
  <div>
    <label htmlFor={label === "Full name" ? "profile-name" : undefined} className="flex items-center gap-2 text-sm font-bold text-gray-600">
      <span className="text-gray-400">{icon}</span> {label}
    </label>
    {children}
  </div>
);

const Detail = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
  <div className="flex items-start gap-3">
    <span className="mt-0.5 text-gray-400">{icon}</span>
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-gray-900">{value}</p>
    </div>
  </div>
);

export default ProfileEditor;
