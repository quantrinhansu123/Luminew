/* eslint-disable no-nested-ternary */
/* eslint-disable react-hooks/rules-of-hooks */
import { SearchOutlined } from "@ant-design/icons";
import { Button, Input, InputRef, Space, TableColumnType } from "antd";
import { FilterDropdownProps, FilterValue } from "antd/es/table/interface";
import { SorterResult } from "antd/lib/table/interface";
import _ from "lodash";
import { useRef, useState } from "react";
import Highlighter from "react-highlight-words";
import { useFilterStore } from "@/stores/filter";

interface InputObject {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export const convertObject = (inputObj: InputObject): InputObject => {
  return _.reduce(
    inputObj,
    (result, value, key) => {
      if (_.isArray(value) && !_.isEmpty(value)) {
        result[key] = value.join(",");
      } else if (_.isNull(value) || _.isUndefined(value)) {
        result[key] = "";
      } else {
        result[key] = value;
      }
      return result;
    },
    {} as InputObject
  );
};

const useTable = <T extends object>() => {
  const [searchText, setSearchText] = useState("");
  const [searchedColumn, setSearchedColumn] = useState("");
  const { query, setQuery, resetQuery } = useFilterStore();
  const searchInput = useRef<InputRef>(null);

  const handleSearch = (
    selectedKeys: string[],
    confirm: FilterDropdownProps["confirm"],
    dataIndex: string
  ) => {
    confirm();
    setSearchText(selectedKeys[0]);
    setSearchedColumn(dataIndex);
  };

  const resetFilter = () => {
    setSearchText("");
    setSearchedColumn("");
    resetQuery();
  };

  const getSortedInfo = (key: string) => {
    if (!query.sort) return undefined;

    const isCurrentColumn = query.sort.includes(key);
    if (!isCurrentColumn) return undefined;

    const isDescending = query.sort.includes("-");
    return isDescending ? "descend" : "ascend";
  };

  const getFilteredValue = (key: string) => {
    if (!query[key]) return undefined;
    return (query[key] as string).split(",");
  };

  const handleResetSearch = (clearFilters: () => void) => {
    clearFilters();
    setSearchText("");
    setQuery({
      ...query,
      page: "1",
      search: "",
      rawsearch: "",
    });
  };

  const onSelectPaginateChange = (page: number) => {
    setQuery({ ...query, page: String(page) });
  };

  const onFilter = (
    filters: Record<string, FilterValue | null>,
    sorter: SorterResult<T> | SorterResult<T>[]
  ) => {
    const filterParams = convertObject(filters);

    const sortColumnKey = Array.isArray(sorter)
      ? sorter[0]?.columnKey
      : sorter?.columnKey;
    const sortOrder = Array.isArray(sorter) ? sorter[0]?.order : sorter?.order;

    let sortParams = "";
    if (sortColumnKey && sortOrder) {
      const prefix = sortOrder === "descend" ? "-" : "";
      sortParams = `${prefix}${sortColumnKey}`;
    }

    setQuery({
      ...query,
      ...filterParams,
      sort: sortParams,
      page: String(1),
    });
  };

  const getColumnSearchProps = (dataIndex: string): TableColumnType<T> => ({
    filterDropdown: ({
      setSelectedKeys,
      selectedKeys,
      confirm,
      clearFilters,
      close,
    }) => (
      <div style={{ padding: 8 }} onKeyDown={(e) => {
        // Only stop propagation for special keys (Enter, Escape, Arrow keys)
        // Allow normal text input including spaces
        if (e.key === 'Enter' || e.key === 'Escape' || e.key.startsWith('Arrow')) {
          e.stopPropagation();
        }
      }}>
        <Input
          ref={searchInput}
          placeholder="Nhập giá trị tìm kiếm"
          value={selectedKeys[0]}
          onChange={(e) =>
            setSelectedKeys(e.target.value ? [e.target.value] : [])
          }
          onPressEnter={() =>
            handleSearch(selectedKeys as string[], confirm, dataIndex)
          }
          style={{ marginBottom: 8, display: "block" }}
        />
        <Space>
          <Button
            type="primary"
            onClick={() =>
              handleSearch(selectedKeys as string[], confirm, dataIndex)
            }
            icon={<SearchOutlined />}
            size="small"
            style={{ width: 90 }}
          >
            Tìm kiếm
          </Button>
          <Button
            onClick={() => clearFilters && handleResetSearch(clearFilters)}
            size="small"
            style={{ width: 90 }}
          >
            Đặt lại
          </Button>
          <Button
            type="link"
            size="small"
            onClick={() => {
              confirm({ closeDropdown: false });
              setSearchText((selectedKeys as string[])[0]);
              setSearchedColumn(dataIndex);
            }}
          >
            Lọc
          </Button>
          <Button type="link" size="small" onClick={() => close()}>
            Đóng
          </Button>
        </Space>
      </div>
    ),

    filterIcon: (filtered: boolean) => (
      <SearchOutlined style={{ color: filtered ? "#1677ff" : undefined }} />
    ),

    onFilterDropdownOpenChange: (visible) => {
      if (visible) {
        setTimeout(() => searchInput.current?.select(), 100);
      }
    },

    render: (text) =>
      searchedColumn === dataIndex ? (
        <Highlighter
          highlightStyle={{ backgroundColor: "#ffc069", padding: 0 }}
          searchWords={[searchText]}
          autoEscape
          textToHighlight={text ? text.toString() : ""}
        />
      ) : (
        text
      ),
  });

  return {
    query,
    getSortedInfo,
    getFilteredValue,
    onFilter,
    resetFilter,
    getColumnSearchProps,
    onSelectPaginateChange,
  };
};

export default useTable;
