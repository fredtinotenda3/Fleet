"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const router = useRouter();

  const handleRegister = async (e) => {
    e.preventDefault();

    const res = await fetch("/api/admin/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstName, email, password }),
    });

    const data = await res.json();

    if (res.ok) {
      setSuccessMsg("Account created! Redirecting to login...");
      setTimeout(() => {
        router.push("/auth/login");
      }, 1500);
    } else {
      setErrorMsg(data.message || "Something went wrong");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <form
        onSubmit={handleRegister}
        className="bg-white p-8 rounded shadow-md w-full max-w-md"
      >
        <h2 className="text-2xl font-semibold mb-6 text-center">📝 Register</h2>

        {errorMsg && <p className="text-red-600 mb-4">{errorMsg}</p>}
        {successMsg && <p className="text-green-600 mb-4">{successMsg}</p>}

        <div className="mb-4">
          <label className="block text-gray-700 mb-1">First Name</label>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="w-full px-3 py-2 border rounded"
            required
          />
        </div>

        <div className="mb-4">
          <label className="block text-gray-700 mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 border rounded"
            required
          />
        </div>

        <div className="mb-6">
          <label className="block text-gray-700 mb-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 border rounded"
            required
          />
        </div>

        <button
          type="submit"
          className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700"
        >
          Register
        </button>

        <button
          type="button"
          onClick={() => router.push("/auth/login")}
          className="w-full mt-4 border border-green-600 text-green-600 py-2 rounded hover:bg-green-50"
        >
          Back to Login
        </button>
      </form>
    </div>
  );
}
