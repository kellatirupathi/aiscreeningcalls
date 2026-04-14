import { BadgeIndianRupee, CircleHelp, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useDashboard } from "@/hooks/useDashboard";

export function TopUtilityBar() {
  const { data } = useDashboard();
  const balanceValue = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Math.max(0, data?.totalCost ?? 0));

  return (
    <div className="top-utility-bar">
      <div className="balance-chip">
        <div className="balance-chip__icon">
          <BadgeIndianRupee size={16} />
        </div>
        <div>
          <span>BALANCE</span>
          <strong>{balanceValue}</strong>
        </div>
      </div>
      <Button>Add more funds</Button>
      <Button className="icon-square" aria-label="Workspace actions">
        <Sparkles size={18} />
      </Button>
      <Button className="icon-square" aria-label="Help">
        <CircleHelp size={18} />
      </Button>
    </div>
  );
}
