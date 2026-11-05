"use client";

import { getApiErrorMessage } from "@/app/utils/api-error";

import axios from "axios";
import Link from "next/link";
import { useEffect, useState } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import AuthSocialButton from "./AuthSocialButton";
import { BsGithub, BsGoogle } from "react-icons/bs";
import { FiArrowRight, FiEye, FiEyeOff, FiLoader } from "react-icons/fi";
import { toast } from "react-hot-toast";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import type { AuthFormValues } from "@/app/types/forms";
import { registrationSchema } from "@/app/schemas/account";
import { validationMessage } from "@/app/schemas/common";

type Variant = "LOGIN" | "REGISTER";

const AuthForm = () => {
  const session = useSession();
  const router = useRouter();
  const [variant, setVariant] = useState<Variant>("LOGIN");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    if (session?.status === "authenticated") {
      router.push("/");
    }
  }, [session?.status, router]);

  const toggleVariant = () => {
    clearErrors();
    setShowPassword(false);
    if (variant === "LOGIN") {
      setVariant("REGISTER");
    } else {
      setVariant("LOGIN");
    }
  };

  const {
    register,
    handleSubmit,
    clearErrors,
    formState: { errors },
  } = useForm<AuthFormValues>({
    defaultValues: {
      name: "",
      email: "",
      password: "",
    },
  });

  const onSubmit: SubmitHandler<AuthFormValues> = (data) => {
    if (variant === "REGISTER") {
      const result = registrationSchema.safeParse(data);
      if (!result.success) {
        toast.error(result.error.issues[0].message);
        return;
      }
      setIsLoading(true);
      axios
        .post("/api/register", result.data)
        .then(() => signIn("credentials", { ...result.data }))
        .catch((error: unknown) => toast.error(getApiErrorMessage(error, "Unable to create account. Please try again.")))
        .finally(() => setIsLoading(false));
    }

    if (variant === "LOGIN") {
      setIsLoading(true);
      signIn("credentials", {
        ...data,
        redirect: false,
      })
        .then((response) => {
          if (response?.error) {
            toast.error(response.error === "RateLimited" ? "Too many sign-in attempts. Please wait before trying again." : response.error === "AuthUnavailable" ? "Sign-in is temporarily unavailable. Please try again later." : "Invalid Credentials");
          } else {
            toast.success("Logged in successfully!");

          }
        })
        .catch(() => toast.error("Unable to sign in. Please try again."))
        .finally(() => setIsLoading(false));
    }
  };

  const socialAction = (action: string) => {
    setIsLoading(true);
    signIn(action, { redirect: false })
      .then((response) => {
        if (response?.error) {
          toast.error("Something went wrong!");
        } else {
          toast.success("Logged in successfully!");
        }
      })
      .catch(() => toast.error("Unable to connect. Please try again."))
      .finally(() => setIsLoading(false));
  };

  const fields: { id: keyof AuthFormValues; label: string; type: string; placeholder: string; autoComplete: string }[] = [
    { id: "email", label: "Email address", type: "email", placeholder: "you@example.com", autoComplete: "email" },
    { id: "password", label: "Password", type: "password", placeholder: variant === "LOGIN" ? "Enter your password" : "Create a password", autoComplete: variant === "LOGIN" ? "current-password" : "new-password" },
  ];
  if (variant === "REGISTER") {
    fields.unshift({ id: "name", label: "Full name", type: "text", placeholder: "Your name", autoComplete: "name" });
  }

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">Your Bidlane account</p>
      <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
        {variant === "LOGIN" ? "Welcome back." : "Join the community."}
      </h1>
      <p className="mt-3 text-sm leading-6 text-slate-500">
        {variant === "LOGIN" ? "Sign in and pick up where you left off." : "Create an account and find your next great drive."}
      </p>

      <form className="mt-8 space-y-5" onSubmit={handleSubmit(onSubmit)} aria-busy={isLoading}>
        {fields.map(({ id, label, type, placeholder, autoComplete }) => (
          <div key={id}>
            <label htmlFor={id} className="block text-sm font-semibold text-slate-700">{label}</label>
            <div className="relative mt-2">
              <input
                id={id}
                type={id === "password" && showPassword ? "text" : type}
                autoComplete={autoComplete}
                placeholder={placeholder}
                disabled={isLoading}
                maxLength={id === "name" ? 60 : id === "email" ? 254 : 1024}
                aria-invalid={Boolean(errors[id])}
                aria-describedby={errors[id] ? `${id}-error` : undefined}
                {...register(id, {
                  required: `${label} is required.`,
                  validate: (value) => variant === "REGISTER" ? validationMessage(registrationSchema.shape[id], value) : true,
                })}
                className={`block w-full rounded-xl border bg-white px-4 py-3.5 text-base text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-400/20 disabled:cursor-wait disabled:opacity-60 sm:text-sm ${id === "password" ? "pr-14" : ""} ${errors[id] ? "border-rose-400" : "border-slate-200 hover:border-slate-300"}`}
              />
              {id === "password" && (
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  disabled={isLoading}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-controls="password"
                  className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-slate-500 transition hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 disabled:cursor-wait disabled:opacity-60"
                >
                  {showPassword ? <FiEyeOff size={20} aria-hidden="true" /> : <FiEye size={20} aria-hidden="true" />}
                </button>
              )}
            </div>
            {errors[id] && <p id={`${id}-error`} role="alert" className="mt-2 text-xs text-rose-600">{errors[id]?.message}</p>}
          </div>
        ))}
        {variant === "LOGIN" && <div className="text-right"><Link href="/forgot-password" className="text-sm font-semibold text-slate-700 underline decoration-amber-400 underline-offset-4 hover:text-amber-700">Forgot password?</Link></div>}
        <button disabled={isLoading} type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-amber-400 px-6 py-3.5 text-sm font-bold text-slate-950 transition hover:bg-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-500 disabled:cursor-wait disabled:opacity-60">
          {isLoading ? <><FiLoader className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> Please wait…</> : <>{variant === "LOGIN" ? "Sign in" : "Create account"}<FiArrowRight aria-hidden="true" /></>}
        </button>
      </form>

      <div className="my-7 flex items-center gap-4 text-xs text-slate-500"><span className="h-px flex-1 bg-slate-200" />Or continue with<span className="h-px flex-1 bg-slate-200" /></div>
      <div className="grid grid-cols-2 gap-3">
        <AuthSocialButton icon={BsGoogle} label="Google" disabled={isLoading} onClick={() => socialAction("google")} />
        <AuthSocialButton icon={BsGithub} label="GitHub" disabled={isLoading} onClick={() => socialAction("github")} />
      </div>
      <p className="mt-8 text-center text-sm leading-6 text-slate-500">
        {variant === "LOGIN" ? "New to Bidlane?" : "Already have an account?"}{" "}
        <button type="button" disabled={isLoading} onClick={toggleVariant} className="rounded-sm font-bold text-slate-950 underline decoration-amber-400 decoration-2 underline-offset-4 hover:text-amber-700 focus-visible:outline-amber-500 disabled:opacity-60">
          {variant === "LOGIN" ? "Create an account" : "Sign in"}
        </button>
      </p>
    </div>
  );
};

export default AuthForm;
