import type { TableColumnsType, TableProps } from 'antd';
import { Pagination, Space, Table } from 'antd';
import type { ExpandableConfig, FilterValue, SorterResult } from 'antd/es/table/interface';
import { useEffect, useMemo, useRef } from 'react';

interface ICommonTableProps<T> {
    dataSource?: T[];
    columns: TableColumnsType<T>;
    totalDocs?: number;
    onFilter?: (filters: Record<string, FilterValue | null>, sorter: SorterResult<T> | SorterResult<T>[]) => void;
    onSelectPaginateChange?: (page: number, limit: number) => void;
    currentPage?: number;
    paging?: boolean;
    limit?: number;
    rank?: boolean;
    loading?: boolean;
    expandable?: ExpandableConfig<T>;
    rowKey?: string | ((record: T) => string);
    pagination?: false | TableProps<T>['pagination'];
    bordered?: boolean;
}

const CommonTable = <T extends object>({
    dataSource,
    columns,
    totalDocs,
    onFilter = () => {},
    onSelectPaginateChange,
    currentPage = 1,
    paging = true,
    limit = 10,
    rank = false,
    loading = false,
    expandable,
    rowKey = '_id',
    pagination,
    bordered = true,
}: ICommonTableProps<T>) => {
    const onChange: TableProps<T>['onChange'] = (_, filters, sorter) => {
        onFilter(filters, sorter);
    };
    const pagingRef = useRef<HTMLDivElement>(null);

    const columnsTable = useMemo(() => {
        const hasNo = columns.some((col) => col.key === 'stt');
        if (rank && !hasNo) {
            columns.unshift({
                title: 'No',
                key: 'stt',
                width: 40,
                render: (_, __, index) => <div className='text-center'>{index + 1 + (currentPage - 1) * limit}</div>,
            });
        }
        return columns;
    }, [rank, limit, currentPage, columns]);
    useEffect(() => {
        const handleScroll = () => {
            const scrollTop = window.scrollY || document.documentElement.scrollTop;
            const windowHeight = window.innerHeight;
            const documentHeight = document.documentElement.scrollHeight;

            if (scrollTop + windowHeight >= documentHeight) {
                if (pagingRef.current) {
                    pagingRef.current.style.backgroundColor = 'transparent';
                }
            } else if (pagingRef.current) {
                pagingRef.current.style.opacity = '0.95';
                pagingRef.current.style.backdropFilter = 'blur(30px)';
            }
        };
        handleScroll();

        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    return (
        <>
            <Table<T>
                rowKey={rowKey}
                bordered={bordered}
                loading={loading}
                onChange={onChange}
                columns={columnsTable}
                dataSource={dataSource}
                pagination={pagination !== undefined ? pagination : false}
                expandable={expandable}
                scroll={{
                    x: 'max-content',
                }}
            />
            {paging && (
                <Space ref={pagingRef} className='sticky bottom-0 z-[10000000] flex w-full justify-end py-3'>
                    <Pagination
                        onChange={onSelectPaginateChange}
                        pageSize={limit}
                        total={totalDocs}
                        showSizeChanger
                        current={currentPage}
                    />
                </Space>
            )}
        </>
    );
};
export default CommonTable;
