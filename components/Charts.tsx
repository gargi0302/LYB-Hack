"use client";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// fixed colour per plastic, same everywhere: the palette from dark to light (Forest, Grass, Moss, Leaf)
export const TYPE_COLOR = { PET: "#31572c", HDPE: "#4f772d", PP: "#90a955", LDPE: "#ecf39e" };
const AXIS = { fontSize: 12, fill: "#4f772d" };

// kg recycled per week, stacked by plastic type
export function WeeklyChart({ data, unit }: { data: Record<string, string | number>[]; unit: string }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ left: -10, right: 8 }}>
        <CartesianGrid vertical={false} stroke="#dae1c6" />
        <XAxis dataKey="week" tick={AXIS} tickLine={false} axisLine={false} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} unit={` ${unit}`} width={72} />
        <Tooltip formatter={(v) => `${Math.round(Number(v))} ${unit}`} cursor={{ fill: "#f2f4dc" }} />
        <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} formatter={(value) => <span style={{ color: "#31572c" }}>{value}</span>} />
        {Object.entries(TYPE_COLOR).map(([type, color], i, all) => (
          <Bar key={type} dataKey={type} stackId="kg" isAnimationActive={false} fill={color} stroke="#faf9f6" strokeWidth={1}
            radius={i === all.length - 1 ? [4, 4, 0, 0] : 0} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

// one value per area, as horizontal bars (area names stay readable on a phone)
export function AreaChart({ data, unit, max }: { data: { area: string; value: number }[]; unit: string; max?: number }) {
  return (
    <ResponsiveContainer width="100%" height={data.length * 40 + 30}>
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 48 }}>
        <XAxis type="number" hide domain={[0, max ?? "auto"]} />
        <YAxis type="category" dataKey="area" tick={AXIS} tickLine={false} axisLine={false} width={110} />
        <Tooltip formatter={(v) => `${Math.round(Number(v))}${unit}`} cursor={{ fill: "#f2f4dc" }} />
        <Bar dataKey="value" fill="#4f772d" isAnimationActive={false} radius={[0, 4, 4, 0]} barSize={18}
          label={{ position: "right", fontSize: 12, fill: "#31572c", formatter: (v: unknown) => `${Math.round(Number(v))}${unit}` }} />
      </BarChart>
    </ResponsiveContainer>
  );
}
