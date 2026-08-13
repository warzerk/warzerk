import { AutoComplete, Input } from 'antd';
import { useMemo, useState } from 'react';
import { searchMaterials, type Material } from '../api/materials';

interface MaterialPickerProps {
  value?: string;
  onSearch: (materialCode: string) => void;
}

let debounceTimer: ReturnType<typeof setTimeout> | undefined;

export default function MaterialPicker({ value, onSearch }: MaterialPickerProps) {
  const [keyword, setKeyword] = useState(value ?? '');
  const [options, setOptions] = useState<Material[]>([]);

  const selectOptions = useMemo(
    () =>
      options.map((m) => ({
        value: m.materialCode,
        label: `${m.materialCode}${m.materialName ? ' - ' + m.materialName : ''}`,
      })),
    [options],
  );

  const handleChange = (text: string) => {
    setKeyword(text);
    clearTimeout(debounceTimer);
    if (!text) {
      setOptions([]);
      return;
    }
    debounceTimer = setTimeout(() => {
      searchMaterials(text)
        .then(setOptions)
        .catch(() => setOptions([]));
    }, 300);
  };

  return (
    <AutoComplete
      style={{ width: 320 }}
      value={keyword}
      options={selectOptions}
      onChange={handleChange}
      onSelect={(v: string) => onSearch(v)}
    >
      <Input.Search
        placeholder="输入物料编码或名称"
        allowClear
        onSearch={(v) => onSearch(v)}
      />
    </AutoComplete>
  );
}
