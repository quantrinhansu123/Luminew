import React, { useRef } from "react";
import { InputNumber, Space } from "antd";

interface DiscountInputProps {
  record: any;
  updateStudentDiscount: (invoiceId: string, discount: number) => Promise<void>;
}

const DiscountInput: React.FC<DiscountInputProps> = ({
  record,
  updateStudentDiscount,
}) => {
  const [localValue, setLocalValue] = React.useState<number>(record.discount);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isPaid = record.status === "paid";

  // Update local value when record changes
  React.useEffect(() => {
    setLocalValue(record.discount);
  }, [record.discount]);

  const handleChange = (value: number | null) => {
    const numValue = value ?? 0;
    setLocalValue(numValue);
    
    if (isPaid) {
      return;
    }

    // Clear previous timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Auto-save after 800ms of no typing (debounce)
    saveTimeoutRef.current = setTimeout(() => {
      updateStudentDiscount(record.id, numValue);
    }, 800);
  };

  const handleSave = () => {
    if (isPaid) {
      return;
    }

    // Clear timeout and save immediately
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    updateStudentDiscount(record.id, localValue);
  };

  return (
    <Space.Compact style={{ width: "100%" }}>
      <InputNumber
        value={localValue}
        min={0}
        max={record.totalAmount}
        onChange={handleChange}
        onPressEnter={handleSave}
        onBlur={handleSave}
        style={{ width: "100%" }}
        size="small"
        disabled={isPaid}
        placeholder={isPaid ? "Đã thu" : "0"}
      />
    </Space.Compact>
  );
};

export default DiscountInput;
