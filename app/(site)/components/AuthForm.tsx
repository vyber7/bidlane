"use client";

import axios from "axios";
import { useEffect, useState } from "react";
import { FieldValues, SubmitHandler, useForm } from "react-hook-form";
import AuthSocialButton from "./AuthSocialButton";
import { BsGithub, BsGoogle } from "react-icons/bs";
import { FiArrowRight, FiLoader } from "react-icons/fi";
import { toast } from "react-hot-toast";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

type Variant = "LOGIN" | "REGISTER";

const AuthForm = () => {
  const session = useSession();
  const router = useRouter();
  const [variant, setVariant] = useState<Variant>("LOGIN");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    if (session?.status === "authenticated") {
      router.push("/");
    }
  }, [session?.status, router]);

  const toggleVariant = () => {
    clearErrors();
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
  } = useForm<FieldValues>({
    defaultValues: {
      name: "",
      email: "",
      password: "",
    },
  });

  const onSubmit: SubmitHandler<FieldValues> = (data) => {
    setIsLoading(true);

    if (variant === "REGISTER") {
      axios
        .post("/api/register", data)
        .then(() => signIn("credentials", data))
        .catch(() => toast.error("Something went wrong!"))
        .finally(() => setIsLoading(false));
    }

    if (variant === "LOGIN") {
      signIn("credentials", {
        ...data,
        redirect: false,
      })
        .then((response) => {
          if (response?.error) {
            toast.error("Invalid Credentials");
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

  const fields = [
    ...(variant === "REGISTER" ? [{ id: "name", label: "Full name", type: "text", placeholder: "Your name", autoComplete: "name" }] : []),
    { id: "email", label: "Email address", type: "email", placeholder: "you@example.com", autoComplete: "email" },
    { id: "password", label: "Password", type: "password", placeholder: variant === "LOGIN" ? "Enter your password" : "Create a password", autoComplete: variant === "LOGIN" ? "current-password" : "new-password" },
  ];

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
            <input
              id={id}
              type={type}
              autoComplete={autoComplete}
              placeholder={placeholder}
              disabled={isLoading}
              aria-invalid={Boolean(errors[id])}
              aria-describedby={errors[id] ? `${id}-error` : undefined}
              {...register(id, { required: `${label} is required.` })}
              className={`mt-2 block w-full rounded-xl border bg-white px-4 py-3.5 text-base text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-400/20 disabled:cursor-wait disabled:opacity-60 sm:text-sm ${errors[id] ? "border-rose-400" : "border-slate-200 hover:border-slate-300"}`}
            />
            {errors[id] && <p id={`${id}-error`} role="alert" className="mt-2 text-xs text-rose-600">{String(errors[id]?.message)}</p>}
          </div>
        ))}
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
