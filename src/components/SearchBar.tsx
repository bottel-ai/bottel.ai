import React from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";

interface SearchBarProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  placeholder?: string;
}

export default function SearchBar({
  value,
  onChange,
  onSubmit,
  placeholder = "Search agents...",
}: SearchBarProps) {
  return (
    <Box>
      <Text color="#54a0ff" bold>
        {">"}{" "}
      </Text>
      <TextInput
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        placeholder={placeholder}
      />
    </Box>
  );
}
