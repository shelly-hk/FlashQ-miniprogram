package com.flashq.mapper;

import com.flashq.entity.UploadRecord;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDate;
import java.util.List;

@Mapper
public interface UploadRecordMapper {

    // 插入上传记录
    void insert(UploadRecord record);

    // 按ID查询
    UploadRecord findById(Integer id);

    // 更新状态与题目数
    void updateStatus(UploadRecord record);

    // 统计某用户某天的上传次数（含解析中和成功的，不含失败的也计入防滥用）
    int countTodayByUserId(@Param("userId") Integer userId,
                           @Param("uploadDate") LocalDate uploadDate);

    // 分页查询用户上传记录
    List<UploadRecord> findByUserId(@Param("userId") Integer userId,
                                    @Param("offset") int offset,
                                    @Param("size") int size);

    // 统计用户上传记录总数
    int countByUserId(@Param("userId") Integer userId);
}
