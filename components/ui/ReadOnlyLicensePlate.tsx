import { Input } from "@/components/ui/input";

interface ReadOnlyLicensePlateProps {
  value: string;
}

export default function ReadOnlyLicensePlate({
  value,
}: ReadOnlyLicensePlateProps) {
  return (
    <div className="mb-4">
      <label className="text-sm font-medium mb-2 block">License Plate</label>
      <Input
        value={value}
        readOnly
        disabled
        className="bg-muted font-mono cursor-not-allowed"
      />
    </div>
  );
}
