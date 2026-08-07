import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { useI18n } from "@/lib/i18n/context";
import { hourChartSeries } from "./utils";

const chartConfig = {
  count: {
    label: "Check-ins",
    color: "#1B3A57",
  },
};

type Props = {
  byHour: Record<string, number>;
};

export function DashboardHourChart({ byHour }: Props) {
  const { t } = useI18n();
  const data = hourChartSeries(byHour);

  return (
    <section className="rounded-xl border border-border/80 bg-card p-5 shadow-sm">
      <h2 className="text-base font-semibold">{t("admin.dashboardPage.byHour")}</h2>
      <ChartContainer config={chartConfig} className="mt-4 h-[180px] w-full sm:h-[220px]">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="hour" tickLine={false} axisLine={false} fontSize={12} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} width={28} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="count" fill="var(--color-count)" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ChartContainer>
    </section>
  );
}
