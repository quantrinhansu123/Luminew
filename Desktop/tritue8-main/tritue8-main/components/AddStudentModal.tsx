import { useEffect, useState } from 'react';
import { Modal, Select, Table, Button, Space, Popconfirm } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { ref, onValue } from 'firebase/database';
import { database } from '../firebase';
import { useClasses } from '../hooks/useClasses';
import { Class } from '../types';

interface AddStudentModalProps {
    open: boolean;
    onClose: () => void;
    classData: Class | null;
}

interface Student {
    id: string;
    'Họ và tên': string;
    'Mã học sinh': string;
}

const AddStudentModal = ({ open, onClose, classData }: AddStudentModalProps) => {
    const [students, setStudents] = useState<Student[]>([]);
    const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
    const [loadingStudents, setLoadingStudents] = useState(true);
    const [adding, setAdding] = useState(false);
    const { addMultipleStudentsToClass, removeStudentFromClass } = useClasses();

    useEffect(() => {
        setLoadingStudents(true);
        const studentsRef = ref(database, 'datasheet/Danh_sách_học_sinh');
        const unsubscribe = onValue(studentsRef, (snapshot) => {
            const data = snapshot.val();
            console.log('AddStudentModal - Raw student data:', data);
            if (data) {
                const studentList = Object.entries(data).map(([id, value]) => ({
                    id,
                    ...(value as Omit<Student, 'id'>)
                }));
                console.log('AddStudentModal - Processed student list:', studentList);
                setStudents(studentList);
            } else {
                console.warn('AddStudentModal - No student data found');
                setStudents([]);
            }
            setLoadingStudents(false);
        }, (error) => {
            console.error('AddStudentModal - Error loading students:', error);
            setLoadingStudents(false);
        });
        return () => unsubscribe();
    }, []);

    const handleAddStudents = async () => {
        if (!classData || selectedStudentIds.length === 0) return;

        setAdding(true);
        try {
            const studentsToAdd = selectedStudentIds.map(studentId => {
                const student = students.find(s => s.id === studentId);
                return {
                    id: studentId,
                    name: student?.['Họ và tên'] || ''
                };
            }).filter(s => s.name); // Filter out any invalid students

            await addMultipleStudentsToClass(classData.id, studentsToAdd);
            setSelectedStudentIds([]);
        } catch (error) {
            console.error('Error adding students:', error);
        } finally {
            setAdding(false);
        }
    };

    const handleRemoveStudent = async (studentId: string) => {
        if (!classData) return;
        await removeStudentFromClass(classData.id, studentId);
    };

    const availableStudents = students.filter(
        s => !classData?.['Student IDs']?.includes(s.id)
    );

    const classStudents = students.filter(
        s => classData?.['Student IDs']?.includes(s.id)
    );

    const columns = [
        {
            title: 'Mã học sinh',
            dataIndex: 'Mã học sinh',
            key: 'code',
        },
        {
            title: 'Họ và tên',
            dataIndex: 'Họ và tên',
            key: 'name',
        },
        {
            title: 'Thao tác',
            key: 'action',
            width: 100,
            render: (_: any, record: Student) => (
                <Popconfirm
                    title="Xóa học sinh khỏi lớp"
                    description="Bạn có chắc chắn muốn xóa học sinh này khỏi lớp?"
                    onConfirm={() => handleRemoveStudent(record.id)}
                    okText="Xóa"
                    cancelText="Hủy"
                >
                    <Button
                        type="link"
                        danger
                        icon={<DeleteOutlined />}
                        size="small"
                    />
                </Popconfirm>
            ),
        },
    ];

    return (
        <Modal
            title={`Quản lý học sinh - ${classData?.['Tên lớp'] || ''}`}
            open={open}
            onCancel={onClose}
            footer={null}
            width={800}
        >
            <div style={{ marginBottom: 16 }}>
                <Space direction="vertical" style={{ width: '100%' }}>
                    <Select
                        mode="multiple"
                        placeholder={loadingStudents ? "Đang tải danh sách học sinh..." : `Chọn học sinh (${availableStudents.length} khả dụng)`}
                        value={selectedStudentIds}
                        onChange={setSelectedStudentIds}
                        style={{ width: '100%' }}
                        showSearch
                        loading={loadingStudents}
                        disabled={loadingStudents || adding}
                        filterOption={(input, option) =>
                            (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                        }
                        options={availableStudents.map(s => ({
                            value: s.id,
                            label: `${s['Họ và tên']} (${s['Mã học sinh']})`
                        }))}
                        notFoundContent={loadingStudents ? "Đang tải..." : "Không tìm thấy học sinh"}
                        maxTagCount="responsive"
                    />
                    <Button
                        type="primary"
                        onClick={handleAddStudents}
                        disabled={selectedStudentIds.length === 0 || loadingStudents || adding}
                        loading={adding}
                        block
                    >
                        Thêm {selectedStudentIds.length > 0 ? `${selectedStudentIds.length} học sinh` : ''}
                    </Button>
                </Space>
            </div>

            <div style={{ marginTop: 24 }}>
                <h4>Danh sách học sinh trong lớp ({classStudents.length})</h4>
                <Table
                    columns={columns}
                    dataSource={classStudents}
                    rowKey="id"
                    pagination={false}
                    size="small"
                />
            </div>
        </Modal>
    );
};

export default AddStudentModal;
