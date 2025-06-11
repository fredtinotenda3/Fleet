type Props = {
  name?: string | null;
};

export default function DashboardHeader({ name }: Props) {
  return (
    <div className="bg-gradient-to-br from-[#0f2027] via-[#203a43] to-[#2c5364] py-6 px-4 text-white text-center">
      <h1 className="text-3xl font-bold flex justify-center items-center gap-2">
        👋 Hello, {name}!
      </h1>
      <p className="text-lg mt-1">
        Welcome to your StanleyVerse - Vehicle Expense & Fleet Management admin.
        dashboard.
      </p>
    </div>
  );
}
